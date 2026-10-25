import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type OrganizationId,
} from '@nutricoach/shared-kernel';
import type { SheetKind, SourceType } from '../domain/sheet.js';

/**
 * Eventos de documents (02 §8): solo identificadores. requested pide al worker una ficha que todavía no existe;
 * generated deja en la auditoría cada PDF nuevo (RN-B03).
 */
export type DocumentsEventType = 'documents.document.requested' | 'documents.document.generated';

export interface DocumentRequestedPayload {
  readonly patientId: string;
  readonly sourceType: SourceType;
  readonly sourceId: string;
}

export interface DocumentGeneratedPayload extends DocumentRequestedPayload {
  readonly kind: SheetKind;
}

export function documentsEvent<TPayload extends DocumentRequestedPayload>(
  type: DocumentsEventType,
  organizationId: OrganizationId,
  aggregateId: string,
  payload: TPayload,
  context: DomainEventContext,
): DomainEvent<DocumentsEventType, TPayload> {
  return createDomainEvent({ type, version: 1, organizationId, aggregateId, payload }, context);
}
