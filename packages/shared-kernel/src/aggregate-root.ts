import type { DomainEvent } from './domain-event.js';
import { Entity } from './entity.js';

/**
 * Raíz de agregado (02 §5): protege sus invariantes, acumula los eventos de lo que pasó y lleva
 * `version` para el bloqueo optimista (06 §5: `If-Match`; 05.1: `version int DEFAULT 0`).
 */
export abstract class AggregateRoot<TId extends string> extends Entity<TId> {
  readonly #version: number;
  readonly #pendingEvents: DomainEvent[] = [];

  /** @param version la guardada al reconstruir; un agregado nuevo empieza en 0. */
  protected constructor(id: TId, version = 0) {
    super(id);
    if (!Number.isInteger(version) || version < 0) {
      throw new RangeError('La versión de un agregado es un entero desde 0.');
    }
    this.#version = version;
  }

  get version(): number {
    return this.#version;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this.#pendingEvents.push(event);
  }

  /** Entrega y vacía los eventos pendientes: el handler los guarda en el outbox (02 §6). */
  pullDomainEvents(): readonly DomainEvent[] {
    return Object.freeze(this.#pendingEvents.splice(0));
  }
}
