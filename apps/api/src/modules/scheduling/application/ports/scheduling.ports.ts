import type {
  AppointmentKind,
  AppointmentMode,
  AppointmentRecord,
  AppointmentStatus,
} from '../../domain/appointment.js';
import type { AvailabilitySlot } from '../../domain/availability.js';

export interface NewAppointment {
  readonly id: string;
  readonly organizationId: string;
  readonly memberId: string;
  readonly patientId: string | null;
  readonly kind: AppointmentKind;
  readonly mode: AppointmentMode;
  readonly location: string | null;
  readonly meetingUrl: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Lo que cambia de una cita: solo las columnas con UPDATE concedido (migración 202611130000). */
export interface AppointmentChanges {
  readonly kind?: AppointmentKind;
  readonly mode?: AppointmentMode;
  readonly location?: string | null;
  readonly meetingUrl?: string | null;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly notes?: string | null;
  readonly status?: AppointmentStatus;
  readonly reminderSentAt?: Date | null;
}

/**
 * scheduling.appointment y scheduling.availability, en la transacción de la UnitOfWork: la RLS deja ver las citas de la
 * organización, sin las de pacientes fuera del equipo de atención (RN-A05), y al paciente solo las suyas.
 */
export interface SchedulingStore {
  /** Un cruce con otra cita del profesional lo rechaza la base (RN-J01): el error sube y el caso de uso lo traduce. */
  insert(appointment: NewAppointment): Promise<void>;
  find(id: string): Promise<AppointmentRecord | null>;
  /** Con bloqueo optimista: false si la versión ya no es esa. */
  update(
    id: string,
    version: number,
    changes: AppointmentChanges,
    updatedAt: Date,
  ): Promise<boolean>;
  /** Las citas que empiezan en [desde, hasta), de un profesional o de todos los que el contexto ve. */
  range(from: Date, to: Date, memberId: string | null): Promise<readonly AppointmentRecord[]>;
  forPatient(patientId: string): Promise<readonly AppointmentRecord[]>;
  /** Las confirmadas sin recordatorio que empiezan en (desde, hasta] (RN-J02). */
  dueReminders(after: Date, until: Date): Promise<readonly AppointmentRecord[]>;
  /** La próxima cita programada o confirmada de cada paciente, desde ese instante. */
  nextForPatients(patientIds: readonly string[], from: Date): Promise<ReadonlyMap<string, Date>>;
  availability(memberId: string): Promise<readonly AvailabilitySlot[]>;
  /** Reemplaza la disponibilidad semanal entera del profesional, vigente desde esa fecha. */
  replaceAvailability(
    organizationId: string,
    memberId: string,
    slots: readonly (AvailabilitySlot & { readonly id: string })[],
    validFrom: string,
  ): Promise<void>;
}

export const SCHEDULING_STORE = Symbol.for('nutricoach.SchedulingStore');
