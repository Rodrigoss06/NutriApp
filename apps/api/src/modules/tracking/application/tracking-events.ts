import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/**
 * Eventos de los registros (02 §8): tracking.*.logged para la analítica (P14), y .voided para que un resumen no cuente lo anulado
 * (RN-G12). Solo identificadores, el día y si fue del plan: nunca lo que comió ni lo que escribió. tracking.day.rescheduled: el
 * paciente o el coach cambiaron hoy o mañana (ADR-104), y tracking vuelve a fijar la meta de hoy; tracking.target.changed: la meta
 * de un día cambió, y la analítica lo recalcula.
 */
export type TrackingEventType =
  | 'tracking.food.logged'
  | 'tracking.food.voided'
  | 'tracking.hydration.logged'
  | 'tracking.hydration.voided'
  | 'tracking.note.logged'
  | 'tracking.metric.logged'
  | 'tracking.metric.voided'
  | 'tracking.checkin.logged'
  | 'tracking.checkin.voided'
  | 'tracking.weeklycheckin.logged'
  | 'tracking.workout.logged'
  | 'tracking.workout.voided'
  | 'tracking.log.adjusted'
  | 'tracking.note.read'
  | 'tracking.day.rescheduled'
  | 'tracking.target.changed';

export interface TrackingEventPayload {
  readonly patientId: string;
  readonly localDate: string;
  readonly inPlan?: boolean;
  /** El registro que reemplaza al anulado, si se corrigió (RN-G12). */
  readonly replacedById?: string | null;
  /** El ajuste del profesional (RN-G02): qué registro, qué hizo y los nombres de lo corregido, nunca sus valores. */
  readonly targetType?: string;
  readonly action?: string;
  readonly fields?: readonly string[];
}

export function trackingEvent(
  type: TrackingEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TrackingEventPayload,
  context: DomainEventContext,
): DomainEvent<TrackingEventType, TrackingEventPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
