import type { DomainEvent, EventMetadata } from '@nutricoach/shared-kernel';

/**
 * Lo que viaja por la cola: el evento como quedó en platform.outbox_event (05.3). Solo identificadores y lo
 * mínimo necesario (02 §8); `occurredAt` en ISO 8601 para que los consumidores comparen el orden.
 */
export interface OutboxEnvelope {
  readonly eventId: string;
  readonly type: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly organizationId: string | null;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly metadata: EventMetadata;
}

/** `nutrition.plan.published` → `nutrition.plan`: contexto y agregado del nombre del evento (06 §3). */
export function aggregateTypeOf(type: DomainEvent['type']): string {
  return type.split('.').slice(0, 2).join('.');
}
