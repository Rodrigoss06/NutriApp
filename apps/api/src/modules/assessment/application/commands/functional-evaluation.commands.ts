import { Inject, Injectable } from '@nestjs/common';
import { movementTestStatus, SAFETY_RULE_VERSION } from '@nutricoach/engine';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { atomically, FileRegistry } from '../../../../platform/index.js';
import { ClinicalApi, type PatientRef } from '../../../clinical/index.js';
import {
  AMEND_ONLY_CLOSED,
  decimalAgeYears,
  EVALUATION_NOT_DRAFT,
  EVALUATION_VERSION_CONFLICT,
  EVALUATOR_NOT_MEMBER,
} from '../../domain/assessment-rules.js';
import {
  FUNCTIONAL_EVALUATION_EMPTY,
  FUNCTIONAL_EVALUATION_NOT_FOUND,
  FUNCTIONAL_TEST_NOT_FOUND,
  UNSUPPORTED_FUNCTIONAL_EVIDENCE,
  type EvaluationModality,
  type FunctionalKind,
  type PhysicalMoment,
} from '../../domain/functional-evaluation.js';
import { assessmentEvent, type AssessmentEventType } from '../assessment-events.js';
import { localDateOf } from '../local-date.js';
import {
  EVALUATION_STORE,
  FUNCTIONAL_EVALUATION_STORE,
  type EvaluationStore,
  type FunctionalEvaluationRecord,
  type FunctionalEvaluationStore,
} from '../ports/assessment.ports.js';

export interface MovementTestInput {
  readonly rightScore: number | null;
  readonly leftScore: number | null;
  readonly pain: boolean;
  readonly asymmetry: boolean;
  readonly modality: EvaluationModality;
  readonly observation: string | null;
  readonly actionNote: string | null;
  readonly reliabilityNote: string | null;
  readonly evidenceUrl: string | null;
}

export interface PhysicalResultInput {
  readonly value: number;
  readonly modality: EvaluationModality;
  readonly notes: string | null;
  readonly evidenceUrl: string | null;
}

interface Actor {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

const actorOf = (context: SecurityContext): Actor => {
  if (!context.organizationId || !context.userId) {
    throw new Error('Caso de uso de evaluación sin organización activa.');
  }
  return { organizationId: context.organizationId, userId: context.userId };
};

const snapshotOf = (patient: PatientRef, localDate: string) => ({
  sex: patient.sex,
  ageYears: decimalAgeYears(patient.birthDate, localDate),
  population: patient.population,
});

/**
 * Evaluación postural y de pruebas físicas (RF-41, 07 §3.3 y §4): se crea en borrador, se registra prueba por prueba y,
 * cerrada, solo se enmienda (RN-D08). El estado de cada prueba postural lo decide el motor (RN-F15) y queda con su versión.
 * Escribir exige ver al paciente, acceso de escritura y HEALTH_DATA (RN-A05, RN-B01); la evidencia, además, el consentimiento
 * IMAGES (07 §4). Cada escritura deja su evento y se audita desde él (RN-B03). No pasa por el cálculo: no da resultados.
 */
@Injectable()
export class FunctionalEvaluationCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(FUNCTIONAL_EVALUATION_STORE) private readonly functional: FunctionalEvaluationStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    private readonly files: FileRegistry,
  ) {}

  create(
    context: SecurityContext,
    patientId: string,
    input: {
      readonly kind: FunctionalKind;
      readonly measuredAt: string;
      readonly moment: PhysicalMoment | null;
      readonly notes: string | null;
    },
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      if (!context.memberId) return err(EVALUATOR_NOT_MEMBER);
      const measuredAt = new Date(input.measuredAt);
      const localDate = localDateOf(measuredAt, patient.value.timezone);
      const id = this.ids.newId<'EvaluationId'>();
      const now = this.clock.now();
      await this.functional.insert({
        id,
        organizationId: actor.organizationId,
        patientId,
        evaluatorMemberId: context.memberId,
        kind: input.kind,
        moment: input.moment,
        measuredAt,
        localDate,
        patientSnapshot: snapshotOf(patient.value, localDate),
        status: 'DRAFT',
        revision: 1,
        amendsEvaluationId: null,
        amendReason: null,
        closedAt: null,
        notes: input.notes,
        createdBy: actor.userId,
        createdAt: now,
        version: 0,
      });
      await this.#emit(context, 'assessment.evaluation.created', patientId, id, {
        kind: input.kind,
      });
      return ok({ id });
    });
  }

  /** Reemplaza una prueba postural, con su estado según el motor (P-14: el dolor manda aunque falte un lado). */
  saveMovementTest(
    context: SecurityContext,
    id: string,
    testCode: string,
    expectedVersion: number,
    input: MovementTestInput,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, 'MOVEMENT', expectedVersion);
      if (!draft.ok) return draft;
      const { movementTests } = await this.functional.catalog();
      if (!movementTests.some((test) => test.code === testCode)) {
        return err(FUNCTIONAL_TEST_NOT_FOUND);
      }
      if (input.evidenceUrl !== null) {
        const images = await this.clinical.ensureImagesConsent(draft.value.patientId);
        if (!images.ok) return images;
      }
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      const current = (await this.functional.movementTests(id)).find(
        (row) => row.testCode === testCode,
      );
      await this.functional.replaceMovementTest(draft.value, {
        ...input,
        testCode,
        status: movementTestStatus(input),
        ruleVersion: SAFETY_RULE_VERSION,
        evidenceFileId: current?.evidenceFileId ?? null,
      });
      await this.#recorded(context, draft.value, testCode);
      return ok(undefined);
    });
  }

  savePhysicalResult(
    context: SecurityContext,
    id: string,
    testCode: string,
    expectedVersion: number,
    input: PhysicalResultInput,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, 'FITNESS', expectedVersion);
      if (!draft.ok) return draft;
      const test = (await this.functional.catalog()).physicalTests.find((t) => t.code === testCode);
      if (!test) return err(FUNCTIONAL_TEST_NOT_FOUND);
      if (input.evidenceUrl !== null) {
        const images = await this.clinical.ensureImagesConsent(draft.value.patientId);
        if (!images.ok) return images;
      }
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      const current = (await this.functional.physicalResults(id)).find(
        (row) => row.testCode === testCode,
      );
      await this.functional.replacePhysicalResult(draft.value, {
        ...input,
        testCode,
        unit: test.unit,
        evidenceFileId: current?.evidenceFileId ?? null,
      });
      await this.#recorded(context, draft.value, testCode);
      return ok(undefined);
    });
  }

  removeTest(
    context: SecurityContext,
    id: string,
    testCode: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, null, expectedVersion);
      if (!draft.ok) return draft;
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      const removed =
        draft.value.kind === 'MOVEMENT'
          ? await this.functional.removeMovementTest(id, testCode)
          : await this.functional.removePhysicalResult(id, testCode);
      if (!removed) return err(FUNCTIONAL_TEST_NOT_FOUND);
      await this.#emit(context, 'assessment.functional.removed', draft.value.patientId, id, {
        testCode,
      });
      return ok(undefined);
    });
  }

  /**
   * Adjunta un archivo a una prueba ya registrada (ADR-038): PDF, PNG o JPEG, con el tipo leído de sus bytes. Exige el
   * consentimiento IMAGES (07 §4). Si no se guarda, los bytes se descartan.
   */
  async attachEvidence(
    context: SecurityContext,
    id: string,
    testCode: string,
    expectedVersion: number,
    content: Uint8Array,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    const file = await this.files.write(actor.organizationId, content);
    if (!file) return err(UNSUPPORTED_FUNCTIONAL_EVIDENCE);
    try {
      const result = await atomically(this.uow, context, async () => {
        const draft = await this.#draft(context, id, null, expectedVersion);
        if (!draft.ok) return draft;
        const images = await this.clinical.ensureImagesConsent(draft.value.patientId);
        if (!images.ok) return images;
        if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
          return err(EVALUATION_VERSION_CONFLICT);
        }
        await this.files.register({
          ...file,
          sizeBytes: content.byteLength,
          organizationId: actor.organizationId,
          purpose: 'ASSESSMENT_EVIDENCE',
          uploadedBy: actor.userId,
        });
        const attached = await this.#setEvidenceFile(draft.value, testCode, file.id);
        if (!attached) return err(FUNCTIONAL_TEST_NOT_FOUND);
        await this.#recorded(context, draft.value, testCode);
        return ok(undefined);
      });
      if (!result.ok) await this.files.discard(file.key);
      return result;
    } catch (error) {
      await this.files.discard(file.key);
      throw error;
    }
  }

  /** Quita el archivo de una prueba; el archivo queda en el registro, como toda evidencia. */
  removeEvidence(
    context: SecurityContext,
    id: string,
    testCode: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, null, expectedVersion);
      if (!draft.ok) return draft;
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      if (!(await this.#setEvidenceFile(draft.value, testCode, null))) {
        return err(FUNCTIONAL_TEST_NOT_FOUND);
      }
      await this.#recorded(context, draft.value, testCode);
      return ok(undefined);
    });
  }

  /** Cierra con al menos una prueba. Si es una revisión, la que enmienda pasa a AMENDED (RN-D08). */
  close(
    context: SecurityContext,
    id: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, null, expectedVersion);
      if (!draft.ok) return draft;
      const evaluation = draft.value;
      const rows =
        evaluation.kind === 'MOVEMENT'
          ? await this.functional.movementTests(id)
          : await this.functional.physicalResults(id);
      if (rows.length === 0) return err(FUNCTIONAL_EVALUATION_EMPTY);
      if (!(await this.evaluations.close(id, expectedVersion, this.clock.now()))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      if (evaluation.amendsEvaluationId) {
        if (!(await this.evaluations.markAmended(evaluation.amendsEvaluationId))) {
          return err(AMEND_ONLY_CLOSED);
        }
        await this.#emit(
          context,
          'assessment.evaluation.amended',
          evaluation.patientId,
          evaluation.amendsEvaluationId,
          { amendmentId: id },
        );
      }
      await this.#emit(context, 'assessment.evaluation.closed', evaluation.patientId, id, {
        evaluationId: id,
        revision: evaluation.revision,
        amendsEvaluationId: evaluation.amendsEvaluationId,
      });
      return ok(undefined);
    });
  }

  /** Una revisión nueva en borrador, con motivo y las mismas pruebas. Cada evaluación se enmienda una sola vez (RN-D08). */
  amend(
    context: SecurityContext,
    id: string,
    reason: string,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const original = await this.functional.find(id);
      if (!original) return err(FUNCTIONAL_EVALUATION_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, original.patientId);
      if (!patient.ok) return patient;
      if (original.status !== 'CLOSED') return err(AMEND_ONLY_CLOSED);
      if ((await this.evaluations.amendedBy([id])).has(id)) return err(AMEND_ONLY_CLOSED);
      const revisionId = this.ids.newId<'EvaluationId'>();
      const revision: FunctionalEvaluationRecord = {
        ...original,
        id: revisionId,
        status: 'DRAFT',
        revision: original.revision + 1,
        amendsEvaluationId: id,
        amendReason: reason,
        closedAt: null,
        createdBy: actor.userId,
        createdAt: this.clock.now(),
        version: 0,
      };
      await this.functional.insert(revision);
      for (const row of await this.functional.movementTests(id)) {
        await this.functional.replaceMovementTest(revision, row);
      }
      for (const row of await this.functional.physicalResults(id)) {
        await this.functional.replacePhysicalResult(revision, row);
      }
      await this.#emit(context, 'assessment.evaluation.created', original.patientId, revisionId, {
        kind: original.kind,
        amendsEvaluationId: id,
      });
      return ok({ id: revisionId });
    });
  }

  async #setEvidenceFile(
    evaluation: FunctionalEvaluationRecord,
    testCode: string,
    evidenceFileId: string | null,
  ): Promise<boolean> {
    if (evaluation.kind === 'MOVEMENT') {
      const row = (await this.functional.movementTests(evaluation.id)).find(
        (r) => r.testCode === testCode,
      );
      if (!row) return false;
      await this.functional.replaceMovementTest(evaluation, { ...row, evidenceFileId });
      return true;
    }
    const row = (await this.functional.physicalResults(evaluation.id)).find(
      (r) => r.testCode === testCode,
    );
    if (!row) return false;
    await this.functional.replacePhysicalResult(evaluation, { ...row, evidenceFileId });
    return true;
  }

  /** La evaluación en borrador, del tipo pedido si se indica, con lo que exige escribir datos de salud (RN-A05, RN-B01). */
  async #draft(
    context: SecurityContext,
    id: string,
    kind: FunctionalKind | null,
    expectedVersion: number,
  ): Promise<Result<FunctionalEvaluationRecord, DomainError>> {
    const evaluation = await this.functional.find(id);
    if (!evaluation) return err(FUNCTIONAL_EVALUATION_NOT_FOUND);
    const patient = await this.clinical.ensureRecordWritable(context, evaluation.patientId);
    if (!patient.ok) return patient;
    if (evaluation.status !== 'DRAFT') return err(EVALUATION_NOT_DRAFT);
    if (kind !== null && evaluation.kind !== kind) return err(FUNCTIONAL_TEST_NOT_FOUND);
    if (evaluation.version !== expectedVersion) return err(EVALUATION_VERSION_CONFLICT);
    return ok(evaluation);
  }

  #recorded(
    context: SecurityContext,
    evaluation: FunctionalEvaluationRecord,
    testCode: string,
  ): Promise<void> {
    return this.#emit(
      context,
      'assessment.functional.recorded',
      evaluation.patientId,
      evaluation.id,
      {
        testCode,
      },
    );
  }

  async #emit(
    context: SecurityContext,
    type: AssessmentEventType,
    patientId: string,
    aggregateId: string,
    payload: object,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        assessmentEvent(
          type,
          actor.organizationId,
          aggregateId,
          { patientId, ...payload },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}
