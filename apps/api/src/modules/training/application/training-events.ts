import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de training (02 §8): solo identificadores; las escrituras se auditan desde ellos. */
export type TrainingEventType =
  | 'training.profile.revised'
  | 'training.program.created'
  | 'training.program.updated'
  | 'training.program.published'
  | 'training.program.superseded';

export function trainingEvent<TPayload extends { patientId: string }>(
  type: TrainingEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<TrainingEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
