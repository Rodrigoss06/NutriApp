import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  systemContext,
  UNIT_OF_WORK,
  type OrganizationId,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import type { Db } from '../database/prisma.provider.js';
import type { EventConsumer } from './event-consumer.js';
import type { OutboxEnvelope } from './outbox-envelope.js';

export type ConsumeOutcome = 'processed' | 'duplicate';

/**
 * Entrega idempotente (02 §6): registra el eventId en platform.processed_event y ejecuta el consumidor en la
 * misma transacción. Si ya estaba, no hace nada; si el consumidor falla, se revierte también el registro y la
 * cola reintenta. Un consumidor con `ownTransactions` corre fuera de esa transacción y se registra al terminar (ADR-131).
 */
@Injectable()
export class ConsumerRunner {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TransactionHost) private readonly db: Db,
  ) {}

  process(consumer: EventConsumer, event: OutboxEnvelope): Promise<ConsumeOutcome> {
    const context = systemContext(event.organizationId as OrganizationId | null);
    if (consumer.ownTransactions) return this.#processOutside(consumer, event, context);
    return this.uow.run(context, async () => {
      const inserted = await this.#record(consumer, event);
      if (inserted === 0) return 'duplicate';
      await consumer.handle(event);
      return 'processed';
    });
  }

  /** Un consumidor con sus propias transacciones: si ya se procesó, nada; si no, corre y después queda registrado. */
  async #processOutside(
    consumer: EventConsumer,
    event: OutboxEnvelope,
    context: ReturnType<typeof systemContext>,
  ): Promise<ConsumeOutcome> {
    const done = await this.uow.query(context, async () => {
      const rows = await this.db.tx.$queryRaw<unknown[]>`
        SELECT 1 FROM platform.processed_event
        WHERE consumer = ${consumer.name} AND event_id = ${event.eventId}::uuid`;
      return rows.length > 0;
    });
    if (done) return 'duplicate';
    await consumer.handle(event);
    const inserted = await this.uow.run(context, () => this.#record(consumer, event));
    return inserted === 0 ? 'duplicate' : 'processed';
  }

  #record(consumer: EventConsumer, event: OutboxEnvelope): Promise<number> {
    return this.db.tx.$executeRaw`
      INSERT INTO platform.processed_event (consumer, event_id)
      VALUES (${consumer.name}, ${event.eventId}::uuid)
      ON CONFLICT DO NOTHING`;
  }
}
