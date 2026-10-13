import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de nutrition (02 §7 y §8): solo identificadores; las escrituras se auditan desde ellos. */
export type NutritionEventType = 'nutrition.prescription.created';

export function nutritionEvent<TPayload extends { patientId: string }>(
  type: NutritionEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<NutritionEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
