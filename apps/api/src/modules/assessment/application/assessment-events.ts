import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/**
 * Eventos de assessment (02 §7 y §8): solo identificadores, nunca medidas ni nombres. Todas las escrituras se auditan
 * desde estos eventos (02 §10); assessment.evaluation.closed lanza además el cálculo (P7, PR 2).
 */
export type AssessmentEventType =
  | 'assessment.evaluation.created'
  | 'assessment.evaluation.updated'
  | 'assessment.measurement.recorded'
  | 'assessment.measurement.removed'
  | 'assessment.bia.recorded'
  | 'assessment.bia.removed'
  | 'assessment.evaluation.closed'
  | 'assessment.evaluation.amended'
  | 'assessment.functional.recorded'
  | 'assessment.functional.removed'
  | 'assessment.technicalerror.recorded'
  | 'assessment.result.computed'
  | 'assessment.preference.changed';

export function assessmentEvent<TPayload extends object>(
  type: AssessmentEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<AssessmentEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
