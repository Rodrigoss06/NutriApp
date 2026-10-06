import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DomainEvent, EventMetadata, Outbox } from '@nutricoach/shared-kernel';
import type { Prisma } from '../database/generated/client.js';
import type { Db } from '../database/prisma.provider.js';
import { aggregateTypeOf } from './outbox-envelope.js';

/**
 * Escritor del outbox (05 §3): INSERT sin RETURNING (`createMany`), porque la política de lectura solo deja
 * ver filas al worker. Exige la transacción del comando: un evento fuera de ella podría publicarse aunque el
 * agregado no se guarde.
 */
@Injectable()
export class PrismaOutbox implements Outbox {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async append(events: readonly DomainEvent[], metadata: EventMetadata = {}): Promise<void> {
    if (events.length === 0) return;
    if (!this.db.isTransactionActive()) {
      throw new Error('El outbox se escribe dentro de la UnitOfWork del comando.');
    }
    await this.db.tx.outboxEvent.createMany({
      data: events.map((event) => ({
        id: event.eventId,
        organizationId: event.organizationId,
        aggregateType: aggregateTypeOf(event.type),
        aggregateId: event.aggregateId,
        eventType: event.type,
        eventVersion: event.version,
        payload: event.payload as Prisma.InputJsonValue,
        metadata: { ...metadata },
        occurredAt: event.occurredAt,
      })),
    });
  }
}
