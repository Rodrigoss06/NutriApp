import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  asId,
  createDomainEvent,
  OUTBOX,
  UNIT_OF_WORK,
  type DomainEvent,
  type OrganizationId,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../database/database.module.js';
import type { Db } from '../database/prisma.provider.js';
import { EVENT_BUS } from './event-bus.js';
import { ConsumerRunner } from './consumer-runner.js';
import { ConsumerRegistry, type EventConsumer } from './event-consumer.js';
import { EventsModule } from './events.module.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import type { OutboxEnvelope } from './outbox-envelope.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import {
  consumerQueue,
  createPgBoss,
  DEAD_LETTER_QUEUE,
  PG_BOSS,
  PG_BOSS_SCHEMA,
  PgBossEventBus,
  RETRY_POLICY,
} from '../queue/pg-boss.provider.js';
import { WorkerRuntime } from '../worker/worker-runtime.js';
import { id, pool } from '../../../test/integration/support/database.js';
import { createTenant, type Tenant } from '../../../test/integration/support/fixtures.js';

/** Consumidor de prueba que cuenta lo que procesa y puede fallar a pedido. */
class RecordingConsumer implements EventConsumer {
  readonly seen: string[] = [];
  failures = 0;

  constructor(
    readonly name: string,
    readonly eventTypes: readonly DomainEvent['type'][] = ['clinical.patient.registered'],
  ) {}

  async handle(event: OutboxEnvelope): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('falla transitoria');
    }
    this.seen.push(event.eventId);
    await Promise.resolve();
  }
}

let moduleRef: TestingModule;
let uow: UnitOfWork;
let outbox: Outbox;
let db: Db;
let dispatcher: OutboxDispatcher;
let runner: ConsumerRunner;
let tenant: Tenant;
const first = new RecordingConsumer('analytics.test-first');
const second = new RecordingConsumer('tenancy.test-second');
const flaky = new RecordingConsumer('analytics.test-flaky', ['clinical.patient.archived']);

const clock = { now: () => new Date() };
const ids = { newId: <T extends string>() => asId<T>(id()) };

const context = (t: Tenant): SecurityContext => ({
  organizationId: t.orgId as OrganizationId,
  userId: asId(t.memberUserId),
  role: 'PROFESSIONAL',
  patientId: null,
});

const event = (type: DomainEvent['type'] = 'clinical.patient.registered') =>
  createDomainEvent(
    {
      type,
      version: 1,
      organizationId: tenant.orgId as OrganizationId,
      aggregateId: tenant.patientId,
      payload: {},
    },
    { clock, ids },
  );

const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> => {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('Tiempo de espera agotado');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

beforeAll(async () => {
  tenant = await createTenant('Outbox');
  moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, EventsModule],
    providers: [
      { provide: PG_BOSS, useFactory: () => createPgBoss() },
      {
        provide: RETRY_POLICY,
        useValue: { retryLimit: 1, retryDelay: 1, retryBackoff: true, retryDelayMax: 1 },
      },
      { provide: EVENT_BUS, useClass: PgBossEventBus },
      OutboxDispatcher,
      MaintenanceService,
      WorkerRuntime,
    ],
  }).compile();
  const registry = moduleRef.get(ConsumerRegistry);
  for (const consumer of [first, second, flaky]) registry.register(consumer);
  await moduleRef.init();
  uow = moduleRef.get(UNIT_OF_WORK);
  outbox = moduleRef.get(OUTBOX);
  db = moduleRef.get(TransactionHost);
  dispatcher = moduleRef.get(OutboxDispatcher);
  runner = moduleRef.get(ConsumerRunner);
}, 60_000);

afterAll(async () => {
  await moduleRef.close();
});

const outboxRow = async (eventId: string) =>
  (
    await pool('owner').query('SELECT published_at FROM platform.outbox_event WHERE id = $1', [
      eventId,
    ])
  ).rows[0] as { published_at: Date | null } | undefined;

describe('02 §6 · outbox: lo confirmado se publica, lo revertido no existe', () => {
  it('un evento de una transacción revertida no se publica', async () => {
    const rolledBack = event();
    await expect(
      uow.run(context(tenant), async () => {
        await outbox.append([rolledBack]);
        throw new Error('el comando falla después de guardar');
      }),
    ).rejects.toThrow();

    await dispatcher.dispatchPending();

    expect(await outboxRow(rolledBack.eventId)).toBeUndefined();
    expect(first.seen).not.toContain(rolledBack.eventId);
  });

  it('el outbox solo se escribe dentro de la UnitOfWork del comando', async () => {
    await expect(outbox.append([event()])).rejects.toThrow('UnitOfWork');
  });

  it('uno confirmado llega a cada consumidor suscrito y se procesa una sola vez por consumidor', async () => {
    const committed = event();
    await uow.run(context(tenant), () => outbox.append([committed], { requestId: 'req-1' }));

    await waitFor(async () => (await outboxRow(committed.eventId))?.published_at != null);
    await waitFor(
      () => first.seen.includes(committed.eventId) && second.seen.includes(committed.eventId),
    );

    // Entrega repetida (al menos una vez): el mismo evento otra vez a cada consumidor.
    const envelope = envelopeOf(committed);
    expect(await runner.process(first, envelope)).toBe('duplicate');
    expect(await runner.process(second, envelope)).toBe('duplicate');

    expect(first.seen.filter((e) => e === committed.eventId)).toHaveLength(1);
    expect(second.seen.filter((e) => e === committed.eventId)).toHaveLength(1);
    const processed = await pool('owner').query(
      'SELECT consumer FROM platform.processed_event WHERE event_id = $1 ORDER BY consumer',
      [committed.eventId],
    );
    expect(processed.rows.map((r: { consumer: string }) => r.consumer)).toEqual([
      'analytics.test-first',
      'tenancy.test-second',
    ]);
  });

  it('un fallo del consumidor revierte su registro y la cola reintenta; agotado, va a la cola de errores', async () => {
    flaky.failures = 1;
    const retried = event('clinical.patient.archived');
    await uow.run(context(tenant), () => outbox.append([retried]));
    await waitFor(() => flaky.seen.includes(retried.eventId), 20_000);
    expect(flaky.seen).toEqual([retried.eventId]);

    flaky.failures = 10;
    const doomed = event('clinical.patient.archived');
    await uow.run(context(tenant), () => outbox.append([doomed]));
    const boss = moduleRef.get<PgBoss>(PG_BOSS);
    await waitFor(async () => {
      // pgboss es de app_user (ADR-024): solo él lo lee.
      const dead = await pool('user').query(
        `SELECT 1 FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1 AND data->>'eventId' = $2`,
        [DEAD_LETTER_QUEUE, doomed.eventId],
      );
      return dead.rowCount === 1;
    }, 20_000);
    expect(flaky.seen).not.toContain(doomed.eventId);
    expect(await boss.getQueue(consumerQueue(flaky.name))).toMatchObject({
      deadLetter: DEAD_LETTER_QUEUE,
    });
    flaky.failures = 0;
  });
});

describe('02 §6 · los consumidores toleran el desorden', () => {
  it('un read model solo avanza con un evento más nuevo: el viejo que llega tarde no lo pisa', async () => {
    const projection = `test-${id()}`;
    const advance = (eventId: string) =>
      uow.run(
        context(tenant),
        () =>
          db.tx.$executeRaw`
          INSERT INTO analytics.projection_checkpoint (projection, last_event_id) VALUES (${projection}, ${eventId}::uuid)
          ON CONFLICT (projection) DO UPDATE SET last_event_id = EXCLUDED.last_event_id
          WHERE projection_checkpoint.last_event_id < EXCLUDED.last_event_id`,
      );
    const older = id();
    const newer = id();

    await advance(newer);
    await advance(older);

    const { rows } = await pool('owner').query(
      'SELECT last_event_id FROM analytics.projection_checkpoint WHERE projection = $1',
      [projection],
    );
    expect(rows).toEqual([{ last_event_id: newer }]);
  });
});

describe('01 §4 · mantenimiento diario del worker', () => {
  it('limpia outbox publicado de más de 7 días, eventos procesados de más de 30 y claves vencidas', async () => {
    const [oldEvent, recentEvent] = [id(), id()];
    const insertEvent = `INSERT INTO platform.outbox_event (id, organization_id, aggregate_type, aggregate_id, event_type,
                           payload, occurred_at, published_at)
                         VALUES ($1, NULL, 'x.y', $1, 'x.y.z', '{}', now(), now() - $2::interval)`;
    await pool('owner').query(insertEvent, [oldEvent, '8 days']);
    await pool('owner').query(insertEvent, [recentEvent, '1 day']);
    await pool('owner').query(
      `INSERT INTO platform.processed_event (consumer, event_id, processed_at) VALUES ('x.old', $1, now() - interval '31 days')`,
      [oldEvent],
    );
    await pool('owner').query(
      `INSERT INTO platform.idempotency_key (user_id, key, method, path, request_hash, expires_at)
       VALUES ($1, 'k', 'POST', '/x', '\\x00', now() - interval '1 minute')`,
      [id()],
    );

    const removed = await moduleRef.get(MaintenanceService).cleanup();

    expect(removed.outboxEvents).toBeGreaterThanOrEqual(1);
    expect(removed.processedEvents).toBeGreaterThanOrEqual(1);
    expect(removed.idempotencyKeys).toBeGreaterThanOrEqual(1);
    expect(await outboxRow(oldEvent)).toBeUndefined();
    expect(await outboxRow(recentEvent)).toBeDefined();
  });

  it('crea las particiones que falten y deja la del mes siguiente', async () => {
    await moduleRef.get(MaintenanceService).ensurePartitions();
    const { rows } = await pool('owner').query('SELECT * FROM app.missing_next_month_partitions()');

    expect(rows).toEqual([]);
    expect(moduleRef.get(WorkerRuntime).running).toBe(true);
  });
});

function envelopeOf(domainEvent: DomainEvent): OutboxEnvelope {
  return {
    eventId: domainEvent.eventId,
    type: domainEvent.type,
    version: domainEvent.version,
    occurredAt: domainEvent.occurredAt.toISOString(),
    organizationId: domainEvent.organizationId,
    aggregateType: 'clinical.patient',
    aggregateId: domainEvent.aggregateId,
    payload: domainEvent.payload,
    metadata: {},
  };
}
