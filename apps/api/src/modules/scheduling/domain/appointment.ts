import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

export type AppointmentKind = 'CONSULTATION' | 'FOLLOW_UP' | 'EVALUATION' | 'TRAINING' | 'OTHER';
export type AppointmentMode = 'IN_PERSON' | 'VIRTUAL';
export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type StatusChange = Exclude<AppointmentStatus, 'SCHEDULED'>;

/** Una cita de la agenda (RF-37). Las horas son instantes en UTC (RN-J03). */
export interface AppointmentRecord {
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
  readonly status: AppointmentStatus;
  readonly notes: string | null;
  readonly reminderSentAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly version: number;
}

/** Una cita dura como mucho 12 horas (ADR-125): lo demás es un error de tipeo. */
export const MAX_APPOINTMENT_MS = 12 * 60 * 60 * 1000;
/** El recordatorio sale 24 horas antes de la cita confirmada (RN-J02). */
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export const APPOINTMENT_NOT_FOUND = domainError({
  code: 'NC-SCH-001',
  message: 'La cita no existe o no la ves.',
});
export const APPOINTMENT_OVERLAP = domainError({
  code: 'NC-SCH-002',
  rule: 'RN-J01',
  message: 'Ese horario se cruza con otra cita del mismo profesional.',
});
export const APPOINTMENT_WINDOW_INVALID = domainError({
  code: 'NC-SCH-003',
  message: 'La cita termina después de empezar y dura como mucho 12 horas.',
});
export const APPOINTMENT_TRANSITION_INVALID = domainError({
  code: 'NC-SCH-004',
  message: 'La cita no puede pasar a ese estado desde el que tiene.',
});
export const AGENDA_NOT_YOURS = domainError({
  code: 'NC-SCH-005',
  message: 'Solo el dueño o un administrador ponen citas en la agenda de otro profesional.',
});
export const AGENDA_MEMBER_NOT_FOUND = domainError({
  code: 'NC-SCH-006',
  message: 'Ese profesional no está activo en la organización.',
});
export const APPOINTMENT_CLOSED = domainError({
  code: 'NC-SCH-007',
  message: 'Una cita realizada, cancelada o sin asistencia ya no se reprograma.',
});
export const ATTENDANCE_TOO_EARLY = domainError({
  code: 'NC-SCH-008',
  message: 'La asistencia se valida desde que empieza la cita.',
});
export const APPOINTMENT_VERSION_CONFLICT = domainError({
  code: 'NC-SCH-009',
  message: 'Alguien cambió esta cita mientras la veías: vuelve a cargarla.',
});

/** Inicio antes del fin y no más de 12 horas. */
export function checkWindow(startsAt: Date, endsAt: Date): Result<void, DomainError> {
  const duration = endsAt.getTime() - startsAt.getTime();
  return duration > 0 && duration <= MAX_APPOINTMENT_MS
    ? ok(undefined)
    : err(APPOINTMENT_WINDOW_INVALID);
}

/** ¿Ya terminó su ciclo? Una cita así no se reprograma ni cambia de datos. */
export const isClosed = (status: AppointmentStatus): boolean =>
  status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW';

/**
 * Las transiciones de una cita (ADR-125): programada → confirmada; programada o confirmada → cancelada; programada o confirmada →
 * realizada o no asistió, solo desde que empezó. Realizada y no asistió se corrigen entre sí, porque validar la asistencia puede
 * equivocarse. Cancelada es final.
 */
export function checkTransition(
  current: AppointmentRecord,
  next: StatusChange,
  now: Date,
): Result<void, DomainError> {
  const attendance = next === 'COMPLETED' || next === 'NO_SHOW';
  if (current.status === next) return err(APPOINTMENT_TRANSITION_INVALID);
  if (current.status === 'CANCELLED') return err(APPOINTMENT_TRANSITION_INVALID);
  if (current.status === 'COMPLETED' || current.status === 'NO_SHOW') {
    return attendance ? ok(undefined) : err(APPOINTMENT_TRANSITION_INVALID);
  }
  if (next === 'CONFIRMED') {
    return current.status === 'SCHEDULED' ? ok(undefined) : err(APPOINTMENT_TRANSITION_INVALID);
  }
  if (attendance && current.startsAt.getTime() > now.getTime()) return err(ATTENDANCE_TOO_EARLY);
  return ok(undefined);
}

/** Ya empezó y nadie validó la asistencia: «por validar» en el resumen del macrociclo (07 §10). */
export const attendancePending = (appointment: AppointmentRecord, now: Date): boolean =>
  (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') &&
  appointment.startsAt.getTime() <= now.getTime();

/** RN-J02: confirmada, sin recordatorio, y empieza dentro de las próximas 24 horas. */
export const reminderDue = (appointment: AppointmentRecord, now: Date): boolean =>
  appointment.status === 'CONFIRMED' &&
  appointment.reminderSentAt === null &&
  appointment.startsAt.getTime() > now.getTime() &&
  appointment.startsAt.getTime() <= now.getTime() + REMINDER_LEAD_MS;

export type AgendaActor =
  | { readonly role: 'OWNER' | 'ADMIN'; readonly memberId: string | null }
  | { readonly role: 'PROFESSIONAL'; readonly memberId: string | null };

/** El dueño y el administrador escriben en cualquier agenda; el profesional, solo en la suya. */
export const canWriteAgenda = (actor: AgendaActor, memberId: string): boolean =>
  actor.role === 'OWNER' || actor.role === 'ADMIN' || actor.memberId === memberId;
