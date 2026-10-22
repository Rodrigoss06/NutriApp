import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de food (02 §8): solo identificadores y nombres de campo; las escrituras se auditan desde ellos. */
export type FoodEventType = 'food.food.created' | 'food.food.updated';

export function foodEvent<TPayload extends { fields?: readonly string[] }>(
  type: FoodEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<FoodEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
