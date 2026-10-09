import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/**
 * Eventos de clinical (02 §8): solo identificadores, nunca nombres ni documentos. `userId` es la cuenta de la app
 * del paciente, si existe: iam cierra sus sesiones al archivar o al revocar APP_ACCESS o HEALTH_DATA.
 */
export type ClinicalEventType =
  | 'clinical.patient.registered'
  | 'clinical.patient.updated'
  | 'clinical.patient.archived'
  | 'clinical.patient.reactivated'
  | 'clinical.careteam.changed'
  | 'clinical.consent.granted'
  | 'clinical.consent.revoked';

export function clinicalEvent<TPayload extends { patientId: string }>(
  type: ClinicalEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<ClinicalEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
