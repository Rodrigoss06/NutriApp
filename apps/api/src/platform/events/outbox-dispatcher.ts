import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  systemContext,
  UNIT_OF_WORK,
  type EventMetadata,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import type { Db } from '../database/prisma.provider.js';
import { EVENT_BUS, type EventBus } from './event-bus.js';
import type { OutboxEnvelope } from './outbox-envelope.js';

interface PendingRow {
  id: string;
  organization_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: unknown;
  metadata: EventMetadata;
  occurred_at: Date;
}

/** El error se guarda recortado: es diagnóstico técnico, nunca datos del evento. */
const MAX_ERROR_LENGTH = 500;

/**
 * Despachador del outbox en el worker (02 §6): toma los eventos pendientes en orden de emisión, los publica
 * y los marca. FOR UPDATE SKIP LOCKED deja correr más de un worker sin publicar dos veces el mismo lote. Si
 * la marca no llega a confirmarse, el evento se vuelve a publicar: los consumidores son idempotentes.
 */
@Injectable()
export class OutboxDispatcher {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  dispatchPending(limit = 100): Promise<number> {
    return this.uow.run(systemContext(), async () => {
      const pending = await this.db.tx.$queryRaw<PendingRow[]>`
        SELECT id, organization_id, aggregate_type, aggregate_id, event_type, event_version, payload, metadata,
               occurred_at
        FROM platform.outbox_event
        WHERE published_at IS NULL
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      let published = 0;
      for (const row of pending) {
        try {
          await this.bus.publish(toEnvelope(row));
          await this.db.tx.$executeRaw`
            UPDATE platform.outbox_event SET published_at = now(), attempts = attempts + 1, last_error = NULL
            WHERE id = ${row.id}::uuid`;
          published += 1;
        } catch (error) {
          const message = (error instanceof Error ? error.message : String(error)).slice(
            0,
            MAX_ERROR_LENGTH,
          );
          await this.db.tx.$executeRaw`
            UPDATE platform.outbox_event SET attempts = attempts + 1, last_error = ${message}
            WHERE id = ${row.id}::uuid`;
        }
      }
      return published;
    });
  }
}

function toEnvelope(row: PendingRow): OutboxEnvelope {
  return {
    eventId: row.id,
    type: row.event_type,
    version: row.event_version,
    occurredAt: row.occurred_at.toISOString(),
    organizationId: row.organization_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    metadata: row.metadata,
  };
}
