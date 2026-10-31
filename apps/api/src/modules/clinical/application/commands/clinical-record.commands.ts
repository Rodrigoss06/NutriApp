import { Inject, Injectable } from '@nestjs/common';
import { SAFETY_RULE_VERSION, SCREENING_FORM_VERSION, screeningStatus } from '@nutricoach/engine';
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
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import {
  canWriteRecord,
  CONDITION_NOT_FOUND,
  GOAL_NOT_FOUND,
  HEALTH_DATA_REQUIRED,
  HISTORY_FORM,
  HISTORY_REVISION_CONFLICT,
  NOTE_NOT_FOUND,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  SCREENING_NOT_FOUND,
  SCREENING_NOT_REVIEWABLE,
  WRITE_ACCESS_REQUIRED,
  type ConditionKind,
  type ConditionStatus,
  type GoalKind,
  type GoalStatus,
  type NoteVisibility,
  type ScreeningDecision,
} from '../../domain/clinical-rules.js';
import { clinicalEvent, type ClinicalEventType } from '../clinical-events.js';
import { computePerformanceProfile } from '../performance-profile.js';
import {
  CLINICAL_RECORD_STORE,
  CONSENT_STORE,
  PATIENT_STORE,
  type ClinicalRecordStore,
  type ConsentStore,
  type PatientRecord,
  type PatientStore,
} from '../ports/clinical.ports.js';
import { actorOf } from './patient.commands.js';

export interface ConditionInput {
  readonly kind: ConditionKind;
  readonly label: string;
  readonly codeSystem?: string | null | undefined;
  readonly code?: string | null | undefined;
  readonly since?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

export interface GoalInput {
  readonly kind: GoalKind;
  readonly metricCode?: string | null | undefined;
  readonly targetValue?: number | null | undefined;
  readonly targetDate?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

export interface NoteInput {
  readonly body: string;
  readonly visibility: NoteVisibility;
  readonly amendsNoteId?: string | null | undefined;
}

/**
 * Historia clínica versionada, condiciones, objetivos y notas (RF-09). Escribir datos de salud exige ver al paciente
 * (RN-A05), que esté activo, acceso WRITE en el equipo y el consentimiento HEALTH_DATA vigente (RN-B01). La historia
 * no se edita: cada guardado es una revisión nueva. Una nota tampoco: se enmienda con otra.
 */
@Injectable()
export class ClinicalRecordCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(CLINICAL_RECORD_STORE) private readonly records: ClinicalRecordStore,
  ) {}

  /**
   * Guarda una revisión nueva de la anamnesis V2 sobre la que se editó (bloqueo optimista), con su perfil de rendimiento
   * (RF-43, RN-F16); la ficha queda bloqueada hasta el final.
   */
  saveHistory(
    context: SecurityContext,
    patientId: string,
    expectedRevision: number,
    answers: Readonly<Record<string, unknown>>,
  ): Promise<Result<{ revision: number }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      await this.records.lockPatient(patientId);
      const current = (await this.records.latestHistory(patientId))?.revision ?? 0;
      if (current !== expectedRevision) return err(HISTORY_REVISION_CONFLICT);
      const profile = computePerformanceProfile(answers);
      if (!profile.ok) return profile;
      const revision = current + 1;
      const historyId = this.ids.newId<'ClinicalHistoryId'>();
      const recordedAt = this.clock.now();
      await this.records.insertHistory({
        id: historyId,
        organizationId: actor.organizationId,
        patientId,
        revision,
        formCode: HISTORY_FORM.code,
        formVersion: HISTORY_FORM.version,
        answers,
        recordedBy: actor.userId,
        recordedAt,
      });
      await this.records.insertPerformanceProfile({
        ...profile.value,
        id: this.ids.newId<'PerformanceProfileId'>(),
        organizationId: actor.organizationId,
        patientId,
        clinicalHistoryId: historyId,
        computedAt: recordedAt,
      });
      await this.#emit(context, 'clinical.history.revised', patientId, patientId, { revision });
      return ok({ revision });
    });
  }

  addCondition(
    context: SecurityContext,
    patientId: string,
    input: ConditionInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      const id = this.ids.newId<'ConditionId'>();
      await this.records.insertCondition({
        id,
        organizationId: actor.organizationId,
        patientId,
        kind: input.kind,
        label: input.label,
        codeSystem: input.codeSystem ?? null,
        code: input.code ?? null,
        status: 'ACTIVE',
        since: input.since ?? null,
        notes: input.notes ?? null,
        createdAt: this.clock.now(),
        createdBy: actor.userId,
      });
      await this.#emit(context, 'clinical.condition.recorded', patientId, id, { kind: input.kind });
      return ok({ id });
    });
  }

  /** De una condición solo cambian el estado y las notas. */
  updateCondition(
    context: SecurityContext,
    patientId: string,
    conditionId: string,
    changes: { status?: ConditionStatus; notes?: string | null },
  ): Promise<Result<void, DomainError>> {
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      if (!(await this.records.updateCondition(patientId, conditionId, changes)))
        return err(CONDITION_NOT_FOUND);
      await this.#emit(context, 'clinical.condition.changed', patientId, conditionId, {
        fields: Object.keys(changes),
      });
      return ok(undefined);
    });
  }

  addGoal(
    context: SecurityContext,
    patientId: string,
    input: GoalInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      const id = this.ids.newId<'GoalId'>();
      await this.records.insertGoal({
        id,
        organizationId: actor.organizationId,
        patientId,
        kind: input.kind,
        metricCode: input.metricCode ?? null,
        targetValue: input.targetValue ?? null,
        targetDate: input.targetDate ?? null,
        status: 'ACTIVE',
        notes: input.notes ?? null,
        createdAt: this.clock.now(),
        createdBy: actor.userId,
      });
      await this.#emit(context, 'clinical.goal.recorded', patientId, id, { kind: input.kind });
      return ok({ id });
    });
  }

  updateGoal(
    context: SecurityContext,
    patientId: string,
    goalId: string,
    changes: { status?: GoalStatus; notes?: string | null },
  ): Promise<Result<void, DomainError>> {
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      if (!(await this.records.updateGoal(patientId, goalId, changes))) return err(GOAL_NOT_FOUND);
      await this.#emit(context, 'clinical.goal.changed', patientId, goalId, {
        fields: Object.keys(changes),
      });
      return ok(undefined);
    });
  }

  /** Una nota con AUTHOR_ONLY la ve solo su autor. Enmendar cita una nota visible del mismo paciente. */
  addNote(
    context: SecurityContext,
    patientId: string,
    input: NoteInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      if (!actor.memberId) return err(WRITE_ACCESS_REQUIRED);
      if (input.amendsNoteId && !(await this.records.findNote(patientId, input.amendsNoteId))) {
        return err(NOTE_NOT_FOUND);
      }
      const id = this.ids.newId<'ClinicalNoteId'>();
      await this.records.insertNote({
        id,
        organizationId: actor.organizationId,
        patientId,
        authorMemberId: actor.memberId,
        body: input.body,
        visibility: input.visibility,
        amendsNoteId: input.amendsNoteId ?? null,
        createdAt: this.clock.now(),
      });
      await this.#emit(context, 'clinical.note.written', patientId, id, {
        visibility: input.visibility,
        amends: input.amendsNoteId ?? null,
      });
      return ok({ id });
    });
  }

  /**
   * Un cribado respondido (RN-F15, 07 §3.2): el estado lo decide el motor, con su versión, y queda el historial. No es un
   * diagnóstico. Por ahora lo registra el equipo; responderlo desde la app llega en P13.
   */
  recordScreening(
    context: SecurityContext,
    patientId: string,
    answers: Readonly<
      Record<'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08', boolean>
    > &
      Readonly<{ S09?: string | undefined }>,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      const id = this.ids.newId<'ScreeningId'>();
      await this.records.insertScreening({
        id,
        organizationId: actor.organizationId,
        patientId,
        formVersion: SCREENING_FORM_VERSION,
        ruleVersion: SAFETY_RULE_VERSION,
        answers: { ...answers },
        status: screeningStatus(answers),
        answeredBy: actor.userId,
        answeredAt: this.clock.now(),
        review: null,
      });
      await this.#emit(context, 'clinical.screening.recorded', patientId, id, {});
      return ok({ id });
    });
  }

  /** La decisión del coach sobre un cribado en rojo o ámbar: iniciar, limitar o derivar, con autor, fecha y nota (RN-F15). */
  reviewScreening(
    context: SecurityContext,
    patientId: string,
    screeningId: string,
    input: { readonly decision: ScreeningDecision; readonly note: string },
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.#writable(context, patientId);
      if (!patient.ok) return patient;
      if (!actor.memberId) return err(WRITE_ACCESS_REQUIRED);
      const screening = (await this.records.screenings(patientId)).find(
        (s) => s.id === screeningId,
      );
      if (!screening) return err(SCREENING_NOT_FOUND);
      if (screening.status === 'GREEN' || screening.review) return err(SCREENING_NOT_REVIEWABLE);
      const reviewed = await this.records.reviewScreening(screeningId, {
        ...input,
        reviewedBy: actor.memberId,
        reviewedAt: this.clock.now(),
      });
      if (!reviewed) return err(SCREENING_NOT_REVIEWABLE);
      await this.#emit(context, 'clinical.screening.reviewed', patientId, screeningId, {});
      return ok(undefined);
    });
  }

  /** Lo que exige escribir datos de salud de un paciente (RN-A05, RN-B01). */
  async #writable(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<PatientRecord, DomainError>> {
    const actor = actorOf(context);
    const patient = await this.patients.find(patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    if (!canWriteRecord(actor, await this.patients.careTeam(patientId)))
      return err(WRITE_ACCESS_REQUIRED);
    if (!(await this.consents.active(patientId, 'HEALTH_DATA'))) return err(HEALTH_DATA_REQUIRED);
    return ok(patient);
  }

  async #emit(
    context: SecurityContext,
    type: ClinicalEventType,
    patientId: string,
    aggregateId: string,
    payload: object,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        clinicalEvent(
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
