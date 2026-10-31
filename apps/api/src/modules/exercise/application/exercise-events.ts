import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Eventos de exercise (02 §8): solo identificadores y nombres de campo; las escrituras se auditan desde ellos. */
export type ExerciseEventType =
  | 'exercise.exercise.created'
  | 'exercise.exercise.updated'
  | 'exercise.exercise.archived'
  | 'exercise.exercise.restored'
  | 'exercise.choice.changed';

export function exerciseEvent<TPayload extends object>(
  type: ExerciseEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<ExerciseEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
