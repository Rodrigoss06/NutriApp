import { Injectable } from '@nestjs/common';
import type { EventType } from '@nutricoach/shared-kernel';
import type { OutboxEnvelope } from './outbox-envelope.js';

/**
 * Consumidor de eventos (02 §6 y §8). Cada uno tiene su cola y su registro en platform.processed_event:
 * recibe cada evento al menos una vez y lo procesa una sola vez. Corre como SYSTEM con la organización del
 * evento, dentro de la misma transacción que marca el evento como procesado.
 *
 * Los eventos pueden llegar desordenados: antes de pisar un read model, el consumidor compara `occurredAt`
 * o la versión de lo que ya tiene y descarta lo más viejo (por ejemplo, active_plan_view solo acepta un plan
 * publicado después del que guarda).
 */
export interface EventConsumer {
  /** Estable: nombra la cola y la fila de processed_event. Minúsculas, puntos y guiones. */
  readonly name: string;
  readonly eventTypes: readonly EventType[];
  handle(event: OutboxEnvelope): Promise<void>;
}

const CONSUMER_NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/** Los módulos registran aquí sus consumidores al iniciar; el worker les crea cola y suscripciones. */
@Injectable()
export class ConsumerRegistry {
  readonly #consumers = new Map<string, EventConsumer>();

  register(consumer: EventConsumer): void {
    if (!CONSUMER_NAME.test(consumer.name)) {
      throw new Error(`Nombre de consumidor inválido: «${consumer.name}» (contexto.nombre).`);
    }
    if (this.#consumers.has(consumer.name)) {
      throw new Error(`Consumidor duplicado: «${consumer.name}».`);
    }
    this.#consumers.set(consumer.name, consumer);
  }

  all(): readonly EventConsumer[] {
    return [...this.#consumers.values()];
  }
}
