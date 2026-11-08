import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de content (02 §8): solo identificadores y nombres de campos; la auditoría los registra (RN-B03). */
export type ContentEventType =
  | 'content.settings.changed'
  | 'content.message.created'
  | 'content.message.updated'
  | 'content.resource.created'
  | 'content.resource.updated'
  | 'content.resource.assigned'
  | 'content.resource.unassigned'
  | 'content.resource.viewed';

export interface ContentEventPayload {
  /** null en un mensaje para todos y en la biblioteca de material. */
  readonly patientId: string | null;
  readonly fields?: readonly string[];
}

export function contentEvent(
  type: ContentEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: ContentEventPayload,
  context: DomainEventContext,
): DomainEvent<ContentEventType, ContentEventPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
