import { Inject, Injectable } from '@nestjs/common';
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
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import {
  foodCorrection,
  setCorrection,
  workoutCorrection,
  type CorrectedValues,
  type Correction,
} from '../../domain/adjustments.js';
import {
  CORRECTION_INVALID,
  METRIC_OUT_OF_RANGE,
  RECORD_NOT_FOUND,
} from '../../domain/tracking-errors.js';
import {
  RECORD_STORE,
  type AdjustmentTarget,
  type RecordStore,
  type StoredAdjustment,
} from '../ports/records.ports.js';
import {
  trackingEvent,
  type TrackingEventPayload,
  type TrackingEventType,
} from '../tracking-events.js';

export interface AdjustmentInput {
  readonly targetType: AdjustmentTarget;
  readonly targetId: string;
  readonly targetLocalDate: string;
  readonly action: 'EXCLUDE' | 'CORRECT';
  readonly correctedValues: Correction | null;
  readonly reason: string;
}

/** Lo que el ajuste necesita del registro: que sea de ese paciente y ese día, y esté vigente (RN-G12). */
type Target =
  | { readonly kind: 'FOOD'; readonly record: Parameters<typeof foodCorrection>[0] }
  | { readonly kind: 'HYDRATION' }
  | { readonly kind: 'METRIC'; readonly metricCode: string }
  | { readonly kind: 'SET'; readonly record: Parameters<typeof setCorrection>[0] }
  | { readonly kind: 'WORKOUT'; readonly record: Parameters<typeof workoutCorrection>[0] }
  | { readonly kind: 'CHECKIN' };

function memberOf(context: SecurityContext): { organizationId: string; memberId: string } {
  if (!context.organizationId || !context.memberId) {
    throw new Error('Un ajuste necesita un miembro de la organización.');
  }
  return { organizationId: context.organizationId, memberId: context.memberId };
}

/**
 * El profesional ajusta los registros del paciente (RN-G02): nunca los sobrescribe. Excluir uno o corregirlo deja un ajuste con
 * su autor y su motivo; el original se conserva y la analítica usa el ajustado. Solo el equipo con acceso de escritura, con
 * HEALTH_DATA vigente (RN-B01). Abrir las notas del paciente las marca leídas (RN-G13). Ambos quedan en la auditoría (RN-B03).
 */
@Injectable()
export class AdjustmentCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  adjust(
    context: SecurityContext,
    patientId: string,
    input: AdjustmentInput,
  ): Promise<Result<StoredAdjustment, DomainError>> {
    const { organizationId, memberId } = memberOf(context);
    return atomically<StoredAdjustment>(this.uow, context, async () => {
      const writable = await this.clinical.ensureRecordWritable(context, patientId);
      if (!writable.ok) return writable;
      const target = await this.#target(patientId, input);
      if (!target) return err(RECORD_NOT_FOUND);
      let correctedValues: CorrectedValues | null = null;
      if (input.action === 'CORRECT') {
        const corrected = await this.#correction(target, input.correctedValues ?? {});
        if (!corrected.ok) return corrected;
        correctedValues = corrected.value;
      }
      const id = this.ids.newId<'LogAdjustmentId'>();
      await this.store.insertAdjustment({
        id,
        organizationId,
        patientId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetLocalDate: input.targetLocalDate,
        action: input.action,
        correctedValues,
        reason: input.reason,
        authorMemberId: memberId,
      });
      await this.#emit(context, 'tracking.log.adjusted', id, {
        patientId,
        localDate: input.targetLocalDate,
        targetType: input.targetType,
        action: input.action,
        fields: input.action === 'EXCLUDE' ? ['status'] : Object.keys(input.correctedValues ?? {}),
      });
      const stored = await this.store.adjustment(id);
      if (!stored) throw new Error('El ajuste no quedó guardado.');
      return ok(stored);
    });
  }

  /** Las notas que el profesional abrió (RN-G13): quedan leídas por él; las que ya estaban leídas no cambian. */
  markNotesRead(
    context: SecurityContext,
    patientId: string,
    noteIds: readonly string[],
  ): Promise<Result<{ readonly marked: number }, DomainError>> {
    const { memberId } = memberOf(context);
    return atomically<{ readonly marked: number }>(this.uow, context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return err(PATIENT_NOT_FOUND);
      const marked = await this.store.markNotesRead(patientId, noteIds, memberId, this.clock.now());
      for (const note of marked) {
        await this.#emit(context, 'tracking.note.read', note.id, {
          patientId,
          localDate: note.localDate,
        });
      }
      return ok({ marked: marked.length });
    });
  }

  /** El registro vigente de ese paciente y ese día; uno de otro paciente, de otro día o anulado no existe aquí. */
  async #target(patientId: string, input: AdjustmentInput): Promise<Target | null> {
    const day = input.targetLocalDate;
    const id = input.targetId;
    switch (input.targetType) {
      case 'FOOD': {
        const record = (await this.store.dayFoodLogs(patientId, day)).find((r) => r.id === id);
        return record ? { kind: 'FOOD', record } : null;
      }
      case 'HYDRATION': {
        const found = (await this.store.dayHydration(patientId, day)).some((r) => r.id === id);
        return found ? { kind: 'HYDRATION' } : null;
      }
      case 'METRIC': {
        const record = (await this.store.dayMetrics(patientId, day)).find((r) => r.id === id);
        return record ? { kind: 'METRIC', metricCode: record.metricCode } : null;
      }
      case 'SET': {
        const record = (await this.store.daySets(patientId, day)).find(
          (r) => r.id === id && r.status === 'ACTIVE',
        );
        return record ? { kind: 'SET', record } : null;
      }
      case 'WORKOUT': {
        const record = (await this.store.dayWorkouts(patientId, day)).find((r) => r.id === id);
        return record ? { kind: 'WORKOUT', record } : null;
      }
      case 'CHECKIN': {
        const record = await this.store.activeCheckin(patientId, day);
        return record?.id === id ? { kind: 'CHECKIN' } : null;
      }
    }
  }

  /** Lo corregido y lo que se deriva de ello (ADR-085). */
  async #correction(
    target: Target,
    correction: Correction,
  ): Promise<Result<CorrectedValues, DomainError>> {
    switch (target.kind) {
      case 'FOOD': {
        const values = foodCorrection(target.record, correction);
        return values ? ok(values) : err(CORRECTION_INVALID);
      }
      case 'HYDRATION':
        return correction.volumeMl === undefined
          ? err(CORRECTION_INVALID)
          : ok({ volumeMl: correction.volumeMl });
      case 'METRIC': {
        if (correction.value === undefined) return err(CORRECTION_INVALID);
        const range = await this.store.metricRange(target.metricCode);
        const value = correction.value;
        const outside =
          !range ||
          (range.min !== null && value < range.min) ||
          (range.max !== null && value > range.max);
        return outside ? err(METRIC_OUT_OF_RANGE) : ok({ value });
      }
      case 'SET': {
        const values = setCorrection(target.record, correction);
        return values ? ok(values) : err(CORRECTION_INVALID);
      }
      case 'WORKOUT': {
        const values = workoutCorrection(target.record, correction);
        return values ? ok(values) : err(CORRECTION_INVALID);
      }
      case 'CHECKIN':
        return err(CORRECTION_INVALID);
    }
  }

  async #emit(
    context: SecurityContext,
    type: TrackingEventType,
    aggregateId: string,
    payload: TrackingEventPayload,
  ): Promise<void> {
    if (!context.organizationId) throw new Error('Un evento de tracking necesita la organización.');
    await this.outbox.append(
      [
        trackingEvent(type, context.organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}
