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
 * cola reintenta.
 */
@Injectable()
export class ConsumerRunner {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TransactionHost) private readonly db: Db,
  ) {}

  process(consumer: EventConsumer, event: OutboxEnvelope): Promise<ConsumeOutcome> {
    const context = systemContext(event.organizationId as OrganizationId | null);
    return this.uow.run(context, async () => {
      const inserted = await this.db.tx.$executeRaw`
        INSERT INTO platform.processed_event (consumer, event_id)
        VALUES (${consumer.name}, ${event.eventId}::uuid)
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) return 'duplicate';
      await consumer.handle(event);
      return 'processed';
    });
  }
}
