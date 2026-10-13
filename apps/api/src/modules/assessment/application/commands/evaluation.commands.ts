import { Inject, Injectable } from '@nestjs/common';
import {
  atomically,
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
import { ClinicalApi, type PatientRef } from '../../../clinical/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import {
  acceptsBia,
  AMEND_ONLY_CLOSED,
  BIA_NOT_ALLOWED,
  BIA_READING_NOT_FOUND,
  checkAttempts,
  closeError,
  decimalAgeYears,
  EVALUATION_NOT_DRAFT,
  EVALUATION_NOT_FOUND,
  EVALUATION_VERSION_CONFLICT,
  EVALUATOR_NOT_MEMBER,
  progressOf,
  SITE_NOT_FOUND,
  type EvaluationConditions,
  type EvaluationKind,
  type EvaluationLevel,
  type MeasurementSide,
} from '../../domain/assessment-rules.js';
import { assessmentEvent, type AssessmentEventType } from '../assessment-events.js';
import { consolidate, firstTwo } from '../data-quality.js';
import { localDateOf } from '../local-date.js';
import {
  EVALUATION_STORE,
  SITE_CATALOG,
  type BiaValueRecord,
  type EvaluationChanges,
  type EvaluationRecord,
  type EvaluationStore,
  type PatientSnapshot,
  type SiteCatalog,
} from '../ports/assessment.ports.js';

export interface CreateEvaluationInput {
  readonly kind: EvaluationKind;
  readonly level: EvaluationLevel | null;
  readonly measuredAt: string;
  readonly conditions: EvaluationConditions;
  readonly evaluatorMemberId?: string | undefined;
  readonly notes?: string | null | undefined;
}

export interface UpdateEvaluationInput {
  readonly level?: EvaluationLevel | undefined;
  readonly measuredAt?: string | undefined;
  readonly conditions?: EvaluationConditions | undefined;
  readonly evaluatorMemberId?: string | undefined;
  readonly notes?: string | null | undefined;
}

export interface BiaReadingInput {
  readonly deviceBrand: string;
  readonly deviceModel: string;
  readonly readings: readonly BiaValueRecord[];
}

interface Actor {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

const actorOf = (context: SecurityContext): Actor => {
  if (!context.organizationId || !context.userId)
    throw new Error('Caso de uso de evaluación sin organización activa.');
  return { organizationId: context.organizationId, userId: context.userId };
};

const snapshotOf = (patient: PatientRef, localDate: string): PatientSnapshot => ({
  sex: patient.sex,
  ageYears: decimalAgeYears(patient.birthDate, localDate),
  population: patient.population,
});

/**
 * Evaluación antropométrica (RF-11 a RF-14): se crea con nivel y condiciones, se capturan las tomas por sitio con
 * validación inmediata (RN-C02 a RN-C04), se cierra cuando el nivel está completo y, cerrada, solo se enmienda con
 * una revisión con motivo (RN-C07). Escribir exige ver al paciente, acceso de escritura en su equipo y HEALTH_DATA
 * (RN-A05, RN-B01); cada escritura deja su evento y se audita desde él.
 */
@Injectable()
export class EvaluationCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  create(
    context: SecurityContext,
    patientId: string,
    input: CreateEvaluationInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const evaluatorMemberId = input.evaluatorMemberId ?? context.memberId ?? null;
      if (!evaluatorMemberId || !(await this.#isMember(actor, evaluatorMemberId))) {
        return err(EVALUATOR_NOT_MEMBER);
      }
      const measuredAt = new Date(input.measuredAt);
      const localDate = localDateOf(measuredAt, patient.value.timezone);
      const id = this.ids.newId<'EvaluationId'>();
      await this.evaluations.insert({
        id,
        organizationId: actor.organizationId,
        patientId,
        evaluatorMemberId,
        kind: input.kind,
        level: input.level,
        measuredAt,
        localDate,
        conditions: input.conditions,
        patientSnapshot: snapshotOf(patient.value, localDate),
        status: 'DRAFT',
        revision: 1,
        amendsEvaluationId: null,
        amendReason: null,
        closedAt: null,
        notes: input.notes ?? null,
        createdBy: actor.userId,
        createdAt: this.clock.now(),
        version: 0,
      });
      await this.#emit(context, 'assessment.evaluation.created', patientId, id, {
        kind: input.kind,
        level: input.level,
      });
      return ok({ id });
    });
  }

  /** Cambia el encabezado del borrador; si cambia la fecha, la edad del snapshot se recalcula. */
  update(
    context: SecurityContext,
    id: string,
    expectedVersion: number,
    input: UpdateEvaluationInput,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, expectedVersion);
      if (!draft.ok) return draft;
      const { evaluation, patient } = draft.value;
      if (input.evaluatorMemberId && !(await this.#isMember(actor, input.evaluatorMemberId))) {
        return err(EVALUATOR_NOT_MEMBER);
      }
      const changes: EvaluationChanges = {
        ...(input.level === undefined ? {} : { level: input.level }),
        ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
        ...(input.evaluatorMemberId === undefined
          ? {}
          : { evaluatorMemberId: input.evaluatorMemberId }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      };
      if (input.measuredAt !== undefined) {
        const measuredAt = new Date(input.measuredAt);
        const localDate = localDateOf(measuredAt, patient.timezone);
        Object.assign(changes, {
          measuredAt,
          localDate,
          patientSnapshot: snapshotOf(patient, localDate),
        });
      }
      if (!(await this.evaluations.updateDraft(evaluation.id, expectedVersion, changes))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      await this.#emit(context, 'assessment.evaluation.updated', evaluation.patientId, id, {
        fields: Object.keys(changes),
      });
      return ok(undefined);
    });
  }

  /**
   * Reemplaza las tomas de un sitio (RN-C02 a RN-C04). El consolidado es derivado (RN-C03): se guarda para las
   * consultas y la API lo vuelve a calcular con el motor al leer.
   */
  recordMeasurement(
    context: SecurityContext,
    id: string,
    siteCode: string,
    expectedVersion: number,
    input: { readonly attempts: readonly number[]; readonly side: MeasurementSide },
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, expectedVersion);
      if (!draft.ok) return draft;
      const site = (await this.catalog.all()).find((s) => s.code === siteCode);
      if (!site) return err(SITE_NOT_FOUND(siteCode));
      const invalid = checkAttempts(site, input.attempts, firstTwo(site, input.attempts));
      if (invalid) return err(invalid);
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      const consolidation = consolidate(site, input.attempts);
      await this.evaluations.saveMeasurement(id, actor.organizationId, {
        siteCode,
        attempts: input.attempts,
        side: input.side,
        consolidatedValue: consolidation.value,
        consolidation: consolidation.method,
        diffPct: consolidation.diffPct,
        needsThird: consolidation.needsThird,
      });
      await this.#emit(
        context,
        'assessment.measurement.recorded',
        draft.value.evaluation.patientId,
        id,
        {
          siteCode,
        },
      );
      return ok(undefined);
    });
  }

  removeMeasurement(
    context: SecurityContext,
    id: string,
    siteCode: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, expectedVersion);
      if (!draft.ok) return draft;
      if (!(await this.evaluations.updateDraft(id, expectedVersion, {}))) {
        return err(EVALUATION_VERSION_CONFLICT);
      }
      if (!(await this.evaluations.deleteMeasurement(id, siteCode))) {
        return err(SITE_NOT_FOUND(siteCode));
      }
      await this.#emit(
        context,
        'assessment.measurement.removed',
        draft.value.evaluation.patientId,
        id,
        {
          siteCode,
        },
      );
      return ok(undefined);
    });
  }

  /** Bioimpedancia cargada a mano con marca y modelo (RN-C08); solo en evaluaciones BIA o MIXED. */
  addBiaReading(
    context: SecurityContext,
    id: string,
    input: BiaReadingInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, null);
      if (!draft.ok) return draft;
      if (!acceptsBia(draft.value.evaluation.kind)) return err(BIA_NOT_ALLOWED);
      const readingId = this.ids.newId<'BiaReadingId'>();
      await this.evaluations.insertBiaReading(actor.organizationId, {
        id: readingId,
        evaluationId: id,
        deviceBrand: input.deviceBrand,
        deviceModel: input.deviceModel,
        readings: input.readings,
        enteredBy: actor.userId,
        createdAt: this.clock.now(),
      });
      await this.evaluations.touch(id);
      await this.#emit(
        context,
        'assessment.bia.recorded',
        draft.value.evaluation.patientId,
        readingId,
        {
          evaluationId: id,
        },
      );
      return ok({ id: readingId });
    });
  }

  removeBiaReading(
    context: SecurityContext,
    id: string,
    readingId: string,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, null);
      if (!draft.ok) return draft;
      if (!(await this.evaluations.deleteBiaReading(id, readingId))) {
        return err(BIA_READING_NOT_FOUND);
      }
      await this.evaluations.touch(id);
      await this.#emit(
        context,
        'assessment.bia.removed',
        draft.value.evaluation.patientId,
        readingId,
        {
          evaluationId: id,
        },
      );
      return ok(undefined);
    });
  }

  /**
   * Cierra la evaluación (RF-14): todos los sitios del nivel consolidados y ninguna tercera toma pendiente (02 §7).
   * Si es una revisión, la evaluación que enmienda pasa a AMENDED (RN-C07). El cierre lanza el cálculo.
   */
  close(
    context: SecurityContext,
    id: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, expectedVersion);
      if (!draft.ok) return draft;
      const { evaluation } = draft.value;
      const sites = await this.catalog.all();
      const bySite = new Map(sites.map((site) => [site.code, site]));
      const measured = (await this.evaluations.measurements(id)).flatMap((m) => {
        const site = bySite.get(m.siteCode);
        return site ? [{ siteCode: m.siteCode, consolidation: consolidate(site, m.attempts) }] : [];
      });
      const bia = (await this.evaluations.biaReadings(id)).length;
      const blocked = closeError(evaluation, progressOf(evaluation, sites, measured, bia), bia);
      if (blocked) return err(blocked);
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

  /**
   * Enmienda una evaluación cerrada (RN-C07): una revisión nueva en borrador, con motivo, que copia el encabezado, las
   * tomas y la bioimpedancia. Cada evaluación se enmienda una sola vez; la revisión se enmienda a su vez.
   */
  amend(
    context: SecurityContext,
    id: string,
    reason: string,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const original = await this.evaluations.find(id);
      if (!original) return err(EVALUATION_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, original.patientId);
      if (!patient.ok) return patient;
      if (original.status !== 'CLOSED') return err(AMEND_ONLY_CLOSED);
      if ((await this.evaluations.amendedBy([id])).has(id)) return err(AMEND_ONLY_CLOSED);
      const revisionId = this.ids.newId<'EvaluationId'>();
      const now = this.clock.now();
      await this.evaluations.insert({
        ...original,
        id: revisionId,
        status: 'DRAFT',
        revision: original.revision + 1,
        amendsEvaluationId: id,
        amendReason: reason,
        closedAt: null,
        createdBy: actor.userId,
        createdAt: now,
        version: 0,
      });
      const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
      for (const measurement of await this.evaluations.measurements(id)) {
        const site = sites.get(measurement.siteCode);
        if (!site) continue;
        const consolidation = consolidate(site, measurement.attempts);
        await this.evaluations.saveMeasurement(revisionId, actor.organizationId, {
          ...measurement,
          consolidatedValue: consolidation.value,
          consolidation: consolidation.method,
          diffPct: consolidation.diffPct,
          needsThird: consolidation.needsThird,
        });
      }
      for (const reading of await this.evaluations.biaReadings(id)) {
        await this.evaluations.insertBiaReading(actor.organizationId, {
          ...reading,
          id: this.ids.newId<'BiaReadingId'>(),
          evaluationId: revisionId,
          enteredBy: actor.userId,
          createdAt: now,
        });
      }
      await this.#emit(context, 'assessment.evaluation.created', original.patientId, revisionId, {
        kind: original.kind,
        level: original.level,
        amendsEvaluationId: id,
      });
      return ok({ id: revisionId });
    });
  }

  /** La evaluación en borrador, con lo que exige escribir datos de salud de su paciente (RN-A05, RN-B01, RN-C07). */
  async #draft(
    context: SecurityContext,
    id: string,
    expectedVersion: number | null,
  ): Promise<Result<{ evaluation: EvaluationRecord; patient: PatientRef }, DomainError>> {
    const evaluation = await this.evaluations.find(id);
    if (!evaluation) return err(EVALUATION_NOT_FOUND);
    const patient = await this.clinical.ensureRecordWritable(context, evaluation.patientId);
    if (!patient.ok) return patient;
    if (evaluation.status !== 'DRAFT') return err(EVALUATION_NOT_DRAFT);
    if (expectedVersion !== null && evaluation.version !== expectedVersion) {
      return err(EVALUATION_VERSION_CONFLICT);
    }
    return ok({ evaluation, patient: patient.value });
  }

  #isMember(actor: Actor, memberId: string): Promise<boolean> {
    return this.tenancy.isActiveMemberId(actor.organizationId, memberId);
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
