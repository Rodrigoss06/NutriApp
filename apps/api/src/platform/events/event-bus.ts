import type { OutboxEnvelope } from './outbox-envelope.js';

/** Publicación hacia las colas de los consumidores. El adaptador es pg-boss (ADR-024). */
export interface EventBus {
  publish(event: OutboxEnvelope): Promise<void>;
}

export const EVENT_BUS = Symbol.for('nutricoach.EventBus');
