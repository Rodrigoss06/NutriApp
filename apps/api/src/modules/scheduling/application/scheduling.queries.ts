import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../clinical/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { APPOINTMENT_NOT_FOUND, type AppointmentRecord } from '../domain/appointment.js';
import type { AvailabilitySlot } from '../domain/availability.js';
import { nextLocalDate, startOfLocalDay } from '../domain/zoned-time.js';
import { SCHEDULING_STORE, type SchedulingStore } from './ports/scheduling.ports.js';

const DEFAULT_TIMEZONE = 'America/Lima';
/** El paciente ve en su app las citas de los últimos 90 días. */
const PAST_DAYS = 90;

export interface Agenda {
  readonly timezone: string;
  readonly appointments: readonly AppointmentRecord[];
}

export interface MyAppointments {
  readonly timezone: string;
  readonly upcoming: readonly AppointmentRecord[];
  readonly past: readonly AppointmentRecord[];
}

/**
 * Lecturas de la agenda: las fechas del rango son locales de la organización y las horas se guardan en UTC (RN-J03). La RLS deja
 * fuera las citas de pacientes que el contexto no ve (RN-A05); el paciente solo ve las suyas.
 */
@Injectable()
export class SchedulingQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  /** Las citas que empiezan de `from` a `to`, ambos días incluidos, de un profesional o de todos. */
  agenda(
    context: SecurityContext,
    from: string,
    to: string,
    memberId: string | null,
  ): Promise<Agenda> {
    return this.uow.query(context, async () => {
      const timezone = await this.#timezone(context);
      const appointments = await this.store.range(
        startOfLocalDay(from, timezone),
        startOfLocalDay(nextLocalDate(to), timezone),
        memberId,
      );
      return { timezone, appointments };
    });
  }

  appointment(
    context: SecurityContext,
    appointmentId: string,
  ): Promise<Result<AppointmentRecord, DomainError>> {
    return this.uow.query(context, async () => {
      const appointment = await this.store.find(appointmentId);
      return appointment ? ok(appointment) : err(APPOINTMENT_NOT_FOUND);
    });
  }

  /** Las citas de un paciente que el contexto ve, para su expediente. */
  patientAppointments(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<Agenda, DomainError>> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return err(PATIENT_NOT_FOUND);
      return ok({
        timezone: await this.#timezone(context),
        appointments: await this.store.forPatient(patientId),
      });
    });
  }

  /** Las del paciente de la sesión: las próximas y las de los últimos 90 días. */
  myAppointments(context: SecurityContext): Promise<MyAppointments> {
    return this.uow.query(context, async () => {
      const timezone = await this.#timezone(context);
      const patientId = context.patientId;
      const all = patientId ? await this.store.forPatient(patientId) : [];
      const now = this.clock.now().getTime();
      const since = now - PAST_DAYS * 86_400_000;
      return {
        timezone,
        upcoming: all.filter((a) => a.endsAt.getTime() > now),
        past: all
          .filter((a) => a.endsAt.getTime() <= now && a.startsAt.getTime() >= since)
          .reverse(),
      };
    });
  }

  availability(
    context: SecurityContext,
    memberId: string,
  ): Promise<{ readonly timezone: string; readonly slots: readonly AvailabilitySlot[] }> {
    return this.uow.query(context, async () => ({
      timezone: await this.#timezone(context),
      slots: await this.store.availability(memberId),
    }));
  }

  async #timezone(context: SecurityContext): Promise<string> {
    const organizationId = context.organizationId;
    if (!organizationId) return DEFAULT_TIMEZONE;
    return (await this.tenancy.organization(organizationId))?.timezone ?? DEFAULT_TIMEZONE;
  }
}
