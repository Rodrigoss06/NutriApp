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
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import type { DayChange, DayChangeKind } from '../../domain/day-changes.js';
import {
  dayScheduleOf,
  profileChangeAllowed,
  todayStepOf,
  type DaySchedule,
  type TodayAction,
} from '../../domain/day-schedule.js';
import { DayScheduleSource, type ScheduleInputs } from '../day-schedule-source.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from '../ports/day-changes.ports.js';
import { trackingEvent } from '../tracking-events.js';

function actorOf(context: SecurityContext): { organizationId: OrganizationId; userId: string } {
  if (!context.organizationId || !context.userId) {
    throw new Error('Cambiar el día necesita la organización y el usuario de la sesión.');
  }
  return { organizationId: context.organizationId, userId: context.userId };
}

/**
 * Los cambios del día (P-20.3 y P-20.4, ADR-104): «no entreno hoy», «mover a mañana» y «sí entreno hoy», que piden el paciente desde
 * su app o el coach; y el perfil de día que el coach elige para hoy o para mañana. Nunca se aplican solos. La meta de hoy la
 * vuelve a fijar tracking al recibir `tracking.day.rescheduled` (el paciente no escribe su meta, RN-G03).
 */
@Injectable()
export class DayScheduleCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(DAY_CHANGE_STORE) private readonly changes: DayChangeStore,
    @Inject(DayScheduleSource) private readonly source: DayScheduleSource,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  /** Lo que el paciente pide para hoy desde su app. */
  patientToday(
    context: SecurityContext,
    action: TodayAction,
  ): Promise<Result<DaySchedule, DomainError>> {
    if (context.role !== 'PATIENT' || !context.patientId) {
      throw new Error('La app del paciente necesita su sesión.');
    }
    const patientId = context.patientId;
    return atomically<DaySchedule>(this.uow, context, () =>
      this.#today(context, patientId, action),
    );
  }

  /** Lo mismo, pedido por el coach con acceso de escritura al paciente. */
  staffToday(
    context: SecurityContext,
    patientId: string,
    action: TodayAction,
  ): Promise<Result<DaySchedule, DomainError>> {
    return atomically<DaySchedule>(this.uow, context, async () => {
      const writable = await this.clinical.ensurePatientWritable(context, patientId);
      if (!writable.ok) return writable;
      return this.#today(context, patientId, action);
    });
  }

  /** El perfil de hoy o de mañana que elige el coach; null vuelve a lo que pide el programa (P-20.4). */
  setProfile(
    context: SecurityContext,
    patientId: string,
    localDate: string,
    profileCode: string | null,
  ): Promise<Result<DaySchedule, DomainError>> {
    return atomically<DaySchedule>(this.uow, context, async () => {
      const writable = await this.clinical.ensurePatientWritable(context, patientId);
      if (!writable.ok) return writable;
      const inputs = await this.source.load(patientId);
      if (!inputs) return err(PATIENT_NOT_FOUND);
      const allowed = profileChangeAllowed(inputs.plan, inputs.today, localDate, profileCode);
      if (!allowed.ok) return allowed;
      let changes = inputs.changes;
      const current = changes.find(
        (change) => change.kind === 'PROFILE' && change.localDate === localDate,
      );
      if (current?.dayProfileCode === profileCode) return ok(this.#schedule(inputs, changes));
      if (current) changes = await this.#void(context, changes, current);
      if (profileCode !== null) {
        changes = await this.#add(context, patientId, changes, localDate, 'PROFILE', profileCode);
      }
      await this.#emit(context, patientId, localDate);
      return ok(this.#schedule(inputs, changes));
    });
  }

  async #today(
    context: SecurityContext,
    patientId: string,
    action: TodayAction,
  ): Promise<Result<DaySchedule, DomainError>> {
    const inputs = await this.source.load(patientId);
    if (!inputs) return err(PATIENT_NOT_FOUND);
    const step = todayStepOf(inputs.calendar, inputs.today, inputs.changes, action);
    if (!step.ok) return step;
    const changes =
      'undo' in step.value
        ? await this.#void(context, inputs.changes, step.value.undo)
        : await this.#add(context, patientId, inputs.changes, inputs.today, step.value.add, null);
    await this.#emit(context, patientId, inputs.today);
    return ok(this.#schedule(inputs, changes));
  }

  #schedule(inputs: ScheduleInputs, changes: readonly DayChange[]): DaySchedule {
    return dayScheduleOf(inputs.calendar, inputs.plan, inputs.today, changes);
  }

  async #add(
    context: SecurityContext,
    patientId: string,
    changes: readonly DayChange[],
    localDate: string,
    kind: DayChangeKind,
    dayProfileCode: string | null,
  ): Promise<readonly DayChange[]> {
    const { organizationId, userId } = actorOf(context);
    const added: DayChange = {
      id: this.ids.newId<'DayChangeId'>(),
      localDate,
      kind,
      dayProfileCode,
      createdAt: this.clock.now(),
    };
    await this.changes.insert({
      ...added,
      organizationId,
      patientId,
      createdBy: userId,
      createdByRole: context.role,
    });
    return [...changes, added];
  }

  async #void(
    context: SecurityContext,
    changes: readonly DayChange[],
    voided: DayChange,
  ): Promise<readonly DayChange[]> {
    await this.changes.void(voided.id, actorOf(context).userId, this.clock.now());
    return changes.filter((change) => change.id !== voided.id);
  }

  /** Para que tracking vuelva a fijar la meta de hoy y la analítica recalcule el día (02 §8). */
  async #emit(context: SecurityContext, patientId: string, localDate: string): Promise<void> {
    const { organizationId } = actorOf(context);
    await this.outbox.append(
      [
        trackingEvent(
          'tracking.day.rescheduled',
          organizationId,
          patientId,
          { patientId, localDate },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}
