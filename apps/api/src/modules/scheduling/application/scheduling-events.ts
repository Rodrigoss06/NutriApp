import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/**
 * Eventos de la agenda (02 §8): solo identificadores y nombres de campos, nunca la nota, el lugar ni el enlace. La auditoría los
 * registra (RN-B03); el panel del profesional recalcula la próxima cita (RF-34); el recordatorio lo envía el worker (RN-J02).
 */
export type SchedulingEventType =
  | 'scheduling.appointment.booked'
  | 'scheduling.appointment.updated'
  | 'scheduling.appointment.confirmed'
  | 'scheduling.appointment.cancelled'
  | 'scheduling.appointment.completed'
  | 'scheduling.appointment.missed'
  | 'scheduling.availability.changed'
  | 'scheduling.reminder.requested';

/** Los que cambian la próxima cita de un paciente. */
export const APPOINTMENT_EVENTS = [
  'scheduling.appointment.booked',
  'scheduling.appointment.updated',
  'scheduling.appointment.confirmed',
  'scheduling.appointment.cancelled',
  'scheduling.appointment.completed',
  'scheduling.appointment.missed',
] as const satisfies readonly SchedulingEventType[];

export interface SchedulingEventPayload {
  /** null en una cita sin paciente y en la disponibilidad. */
  readonly patientId: string | null;
  readonly memberId: string;
  readonly fields?: readonly string[];
}

export function schedulingEvent(
  type: SchedulingEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: SchedulingEventPayload,
  context: DomainEventContext,
): DomainEvent<SchedulingEventType, SchedulingEventPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
