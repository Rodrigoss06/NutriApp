import type { DomainEvent } from '../domain-event.js';
import type { ActorRole } from './unit-of-work.port.js';

/** Contexto técnico del evento (05.3 `metadata`): nunca datos personales. */
export interface EventMetadata {
  readonly requestId?: string;
  readonly actorUserId?: string | null;
  readonly actorRole?: ActorRole;
}

/**
 * Puerto del outbox (02 §6): el handler guarda los eventos del agregado en la misma transacción que el
 * agregado. Si la transacción se revierte, los eventos tampoco existen; si se confirma, el worker los
 * publica al menos una vez.
 */
export interface Outbox {
  append(events: readonly DomainEvent[], metadata?: EventMetadata): Promise<void>;
}

/** Token de inyección del Outbox. */
export const OUTBOX = Symbol.for('nutricoach.Outbox');
