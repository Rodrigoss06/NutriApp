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
import { atomically } from '../../../platform/index.js';
import { ClinicalApi } from '../../clinical/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import {
  AGENDA_MEMBER_NOT_FOUND,
  AGENDA_NOT_YOURS,
  APPOINTMENT_CLOSED,
  APPOINTMENT_NOT_FOUND,
  APPOINTMENT_OVERLAP,
  APPOINTMENT_VERSION_CONFLICT,
  canWriteAgenda,
  checkTransition,
  checkWindow,
  isClosed,
  type AgendaActor,
  type AppointmentKind,
  type AppointmentMode,
  type AppointmentRecord,
  type StatusChange,
} from '../domain/appointment.js';
import { checkSlots, type AvailabilitySlot } from '../domain/availability.js';
import { localDateOf } from '../domain/zoned-time.js';
import {
  SCHEDULING_STORE,
  type AppointmentChanges,
  type SchedulingStore,
} from './ports/scheduling.ports.js';
import { schedulingEvent, type SchedulingEventType } from './scheduling-events.js';

export interface BookAppointment {
  readonly memberId?: string | undefined;
  readonly patientId?: string | undefined;
  readonly kind: AppointmentKind;
  readonly mode: AppointmentMode;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly location?: string | undefined;
  readonly meetingUrl?: string | undefined;
  readonly notes?: string | undefined;
}

export interface EditAppointment {
  readonly kind?: AppointmentKind | undefined;
  readonly mode?: AppointmentMode | undefined;
  readonly startsAt?: Date | undefined;
  readonly endsAt?: Date | undefined;
  readonly location?: string | null | undefined;
  readonly meetingUrl?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

/** Un cruce de citas que la base rechazó (RN-J01): el store lo avisa sin el error de PostgreSQL. */
export class AppointmentOverlap extends Error {
  constructor() {
    super('RN-J01');
  }
}

const COLUMNS: Readonly<Record<keyof EditAppointment, string>> = {
  kind: 'kind',
  mode: 'mode',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  location: 'location',
  meetingUrl: 'meeting_url',
  notes: 'notes',
};

const STATUS_EVENTS: Readonly<Record<StatusChange, SchedulingEventType>> = {
  CONFIRMED: 'scheduling.appointment.confirmed',
  CANCELLED: 'scheduling.appointment.cancelled',
  COMPLETED: 'scheduling.appointment.completed',
  NO_SHOW: 'scheduling.appointment.missed',
};

/**
 * La agenda (RF-37, ADR-125): el dueño y el administrador escriben en cualquier agenda y el profesional en la suya; una cita con
 * paciente exige acceso de escritura a su expediente (RN-A05), sin HEALTH_DATA, porque una cita no es un dato de salud. La base
 * rechaza los cruces aunque lleguen a la vez (RN-J01). Cada cambio deja su evento para la auditoría (RN-B03).
 */
@Injectable()
export class SchedulingCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  book(
    context: SecurityContext,
    input: BookAppointment,
  ): Promise<Result<AppointmentRecord, DomainError>> {
    const organizationId = organizationOf(context);
    return overlapAware(() =>
      atomically(this.uow, context, async () => {
        const memberId = input.memberId ?? context.memberId ?? null;
        if (!memberId) return err(AGENDA_MEMBER_NOT_FOUND);
        const allowed = await this.#ensureAgenda(context, organizationId, memberId);
        if (!allowed.ok) return allowed;
        const window = checkWindow(input.startsAt, input.endsAt);
        if (!window.ok) return window;
        const patientId = input.patientId ?? null;
        if (patientId) {
          const writable = await this.clinical.ensurePatientWritable(context, patientId);
          if (!writable.ok) return writable;
        }
        const record: AppointmentRecord = {
          id: this.ids.newId<'AppointmentId'>(),
          organizationId,
          memberId,
          patientId,
          kind: input.kind,
          mode: input.mode,
          location: input.location ?? null,
          meetingUrl: input.meetingUrl ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: 'SCHEDULED',
          notes: input.notes ?? null,
          reminderSentAt: null,
          createdBy: actorOf(context),
          createdAt: this.clock.now(),
          version: 0,
        };
        await this.store.insert(record);
        await this.#emit(context, 'scheduling.appointment.booked', record);
        return ok(record);
      }),
    );
  }

  /** Reprogramar o cambiar sus datos (If-Match). Cambiar la hora vuelve a dejar pendiente el recordatorio (RN-J02). */
  edit(
    context: SecurityContext,
    appointmentId: string,
    version: number,
    input: EditAppointment,
  ): Promise<Result<AppointmentRecord, DomainError>> {
    return overlapAware(() =>
      atomically(this.uow, context, async () => {
        const current = await this.#writable(context, appointmentId, version);
        if (!current.ok) return current;
        if (isClosed(current.value.status)) return err(APPOINTMENT_CLOSED);
        const startsAt = input.startsAt ?? current.value.startsAt;
        const endsAt = input.endsAt ?? current.value.endsAt;
        const window = checkWindow(startsAt, endsAt);
        if (!window.ok) return window;
        const changes: { -readonly [K in keyof AppointmentChanges]: AppointmentChanges[K] } = {};
        const fields: string[] = [];
        for (const key of Object.keys(COLUMNS) as (keyof EditAppointment)[]) {
          const value = input[key];
          if (value === undefined || sameValue(current.value[key], value)) continue;
          Object.assign(changes, { [key]: value });
          fields.push(COLUMNS[key]);
        }
        if (fields.length === 0) return ok(current.value);
        const moved = changes.startsAt !== undefined || changes.endsAt !== undefined;
        if (moved && current.value.reminderSentAt) {
          changes.reminderSentAt = null;
          fields.push('reminder_sent_at');
        }
        const now = this.clock.now();
        if (!(await this.store.update(appointmentId, version, changes, now))) {
          return err(APPOINTMENT_VERSION_CONFLICT);
        }
        const updated = { ...current.value, ...changes, version: version + 1 };
        await this.#emit(context, 'scheduling.appointment.updated', updated, fields);
        return ok(updated);
      }),
    );
  }

  /** Confirmar, cancelar o validar la asistencia (If-Match): realizada o no asistió, desde que empezó la cita. */
  changeStatus(
    context: SecurityContext,
    appointmentId: string,
    version: number,
    status: StatusChange,
  ): Promise<Result<AppointmentRecord, DomainError>> {
    return overlapAware(() =>
      atomically(this.uow, context, async () => {
        const current = await this.#writable(context, appointmentId, version);
        if (!current.ok) return current;
        const now = this.clock.now();
        const transition = checkTransition(current.value, status, now);
        if (!transition.ok) return transition;
        if (!(await this.store.update(appointmentId, version, { status }, now))) {
          return err(APPOINTMENT_VERSION_CONFLICT);
        }
        const updated = { ...current.value, status, version: version + 1 };
        await this.#emit(context, STATUS_EVENTS[status], updated, ['status']);
        return ok(updated);
      }),
    );
  }

  /** Reemplaza la disponibilidad semanal del profesional, vigente desde hoy en la fecha de la organización (RN-J03). */
  replaceAvailability(
    context: SecurityContext,
    memberId: string,
    slots: readonly AvailabilitySlot[],
  ): Promise<Result<readonly AvailabilitySlot[], DomainError>> {
    const organizationId = organizationOf(context);
    return atomically(this.uow, context, async () => {
      const allowed = await this.#ensureAgenda(context, organizationId, memberId);
      if (!allowed.ok) return allowed;
      const checked = checkSlots(slots);
      if (!checked.ok) return checked;
      const organization = await this.tenancy.organization(organizationId);
      const today = localDateOf(this.clock.now(), organization?.timezone ?? 'America/Lima');
      await this.store.replaceAvailability(
        organizationId,
        memberId,
        checked.value.map((slot) => ({ ...slot, id: this.ids.newId<'AvailabilityId'>() })),
        today,
      );
      await this.outbox.append(
        [
          schedulingEvent(
            'scheduling.availability.changed',
            organizationId,
            memberId,
            { patientId: null, memberId, fields: ['day_of_week', 'start_time', 'end_time'] },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: context.userId, actorRole: context.role },
      );
      return ok(checked.value);
    });
  }

  /** El profesional es miembro activo y quien escribe puede usar su agenda. */
  async #ensureAgenda(
    context: SecurityContext,
    organizationId: OrganizationId,
    memberId: string,
  ): Promise<Result<void, DomainError>> {
    if (!canWriteAgenda(actorFor(context), memberId)) return err(AGENDA_NOT_YOURS);
    if (!(await this.tenancy.isActiveMemberId(organizationId, memberId)))
      return err(AGENDA_MEMBER_NOT_FOUND);
    return ok(undefined);
  }

  /** La cita que el contexto ve, en una agenda que puede escribir y con la versión de If-Match. */
  async #writable(
    context: SecurityContext,
    appointmentId: string,
    version: number,
  ): Promise<Result<AppointmentRecord, DomainError>> {
    const current = await this.store.find(appointmentId);
    if (!current) return err(APPOINTMENT_NOT_FOUND);
    if (!canWriteAgenda(actorFor(context), current.memberId)) return err(AGENDA_NOT_YOURS);
    if (current.version !== version) return err(APPOINTMENT_VERSION_CONFLICT);
    return ok(current);
  }

  async #emit(
    context: SecurityContext,
    type: SchedulingEventType,
    appointment: AppointmentRecord,
    fields?: readonly string[],
  ): Promise<void> {
    await this.outbox.append(
      [
        schedulingEvent(
          type,
          organizationOf(context),
          appointment.id,
          {
            patientId: appointment.patientId,
            memberId: appointment.memberId,
            ...(fields ? { fields } : {}),
          },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

/** La base rechazó un cruce (RN-J01): la transacción ya se revirtió y vuelve como error de dominio. */
async function overlapAware<T>(
  work: () => Promise<Result<T, DomainError>>,
): Promise<Result<T, DomainError>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppointmentOverlap) return err(APPOINTMENT_OVERLAP);
    throw error;
  }
}

const sameValue = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

function actorFor(context: SecurityContext): AgendaActor {
  const role = context.role === 'OWNER' || context.role === 'ADMIN' ? context.role : 'PROFESSIONAL';
  return { role, memberId: context.memberId ?? null };
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId) throw new Error('scheduling necesita la organización activa.');
  return context.organizationId;
}

function actorOf(context: SecurityContext): string {
  if (!context.userId) throw new Error('scheduling necesita el usuario.');
  return context.userId;
}
