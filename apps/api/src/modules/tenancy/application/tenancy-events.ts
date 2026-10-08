import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type EventType,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de tenancy (02 §8): solo identificadores y lo mínimo; la auditoría los registra (02 §10). */
export type TenancyEventType =
  | 'tenancy.organization.created'
  | 'tenancy.organization.updated'
  | 'tenancy.member.added'
  | 'tenancy.member.changed'
  | 'tenancy.member.removed'
  | 'tenancy.subscription.changed'
  | 'tenancy.subscription.expired'
  | 'tenancy.setting.changed';

export function tenancyEvent<TPayload>(
  type: TenancyEventType & EventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<TenancyEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
