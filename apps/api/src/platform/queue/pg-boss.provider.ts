import { Inject, Injectable } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { loadEnv } from '../config/env.js';
import type { EventBus } from '../events/event-bus.js';
import type { OutboxEnvelope } from '../events/outbox-envelope.js';

/** Token de la instancia de pg-boss. Solo el worker la arranca (01 §4). */
export const PG_BOSS = Symbol.for('nutricoach.PgBoss');

/** Esquema de pg-boss: de app_user, creado por la migración 0000 (ADR-024). */
export const PG_BOSS_SCHEMA = 'pgboss';

/** Cola de errores: los trabajos que agotaron sus reintentos, para revisarlos y reenviarlos (01 §8). */
export const DEAD_LETTER_QUEUE = 'platform.dead-letter';

/** Reintentos con espera creciente: 30 s, 1 min, 2 min... hasta 1 h entre intentos, 5 veces. */
export interface RetryPolicy {
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  readonly retryDelayMax: number;
}

export const RETRY_POLICY = Symbol.for('nutricoach.RetryPolicy');
export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 3600,
});

/** Conexiones de pg-boss en el worker, aparte de las de Prisma. */
const POOL_SIZE = 4;

/**
 * pg-boss se migra solo dentro de su esquema, pero no lo crea: app_user no tiene CREATE en la base y el
 * esquema ya viene de la migración 0000.
 */
export function createPgBoss(connectionString = loadEnv().DATABASE_URL): PgBoss {
  return new PgBoss({
    connectionString,
    schema: PG_BOSS_SCHEMA,
    createSchema: false,
    max: POOL_SIZE,
  });
}

/** Cola de un consumidor: una por consumidor, suscrita a sus tipos de evento. */
export const consumerQueue = (consumerName: string): string => `events.${consumerName}`;

/** Publica en pg-boss: cada consumidor suscrito al tipo recibe una copia en su cola. */
@Injectable()
export class PgBossEventBus implements EventBus {
  constructor(@Inject(PG_BOSS) private readonly boss: PgBoss) {}

  async publish(event: OutboxEnvelope): Promise<void> {
    await this.boss.publish(event.type, { ...event });
  }
}
