import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import type { ConsumerRunner } from '../events/consumer-runner.js';
import { ConsumerRegistry, type EventConsumer } from '../events/event-consumer.js';
import type { OutboxDispatcher } from '../events/outbox-dispatcher.js';
import type { OutboxEnvelope } from '../events/outbox-envelope.js';
import { JobRegistry } from '../jobs/job-registry.js';
import type { MaintenanceService } from '../maintenance/maintenance.service.js';
import { DEFAULT_RETRY_POLICY } from '../queue/pg-boss.provider.js';
import { CONSUMER_WORK_OPTIONS, WorkerRuntime } from './worker-runtime.js';

type Handler = (jobs: { data: OutboxEnvelope }[]) => Promise<void>;

/** Un pg-boss de mentira que guarda cómo se pide trabajo de cada cola. */
function fakeBoss() {
  const work = vi.fn<(name: string, ...rest: unknown[]) => Promise<string>>(() =>
    Promise.resolve('w'),
  );
  const boss = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    createQueue: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn(() => Promise.resolve()),
    schedule: vi.fn(() => Promise.resolve()),
    work,
  };
  return { boss: boss as unknown as PgBoss, work };
}

const envelope = (eventId: string): OutboxEnvelope => ({
  eventId,
  type: 'assessment.measurement.recorded',
  version: 1,
  occurredAt: new Date(0).toISOString(),
  organizationId: null,
  aggregateType: 'assessment.evaluation',
  aggregateId: eventId,
  payload: {},
  metadata: {},
});

describe('02 §6 · RN-B03 · el worker lee cada cola de consumidor por lotes', () => {
  it('pide hasta 50 eventos por lectura y sigue sin pausa mientras lleguen lotes llenos; los procesa en orden', async () => {
    const { boss, work } = fakeBoss();
    const registry = new ConsumerRegistry();
    const consumer: EventConsumer = {
      name: 'audit.events',
      eventTypes: ['assessment.measurement.recorded'],
      handle: () => Promise.resolve(),
    };
    registry.register(consumer);
    const processed: string[] = [];
    const runner = {
      process: (_: EventConsumer, event: OutboxEnvelope) => {
        processed.push(event.eventId);
        return Promise.resolve('processed' as const);
      },
    } as unknown as ConsumerRunner;
    const runtime = new WorkerRuntime(
      boss,
      registry,
      new JobRegistry(),
      runner,
      { dispatchPending: () => Promise.resolve(0) } as unknown as OutboxDispatcher,
      {
        ensurePartitions: () => Promise.resolve(0),
        cleanup: () => Promise.resolve({}),
      } as unknown as MaintenanceService,
      DEFAULT_RETRY_POLICY,
    );

    await runtime.onApplicationBootstrap();
    await runtime.onApplicationShutdown('test');

    const call = work.mock.calls.find(([name]) => name === 'events.audit.events');
    expect(call?.[1]).toEqual(CONSUMER_WORK_OPTIONS);
    expect(CONSUMER_WORK_OPTIONS).toEqual({ batchSize: 50, burstWhenBatchFull: true });
    const handler = call?.[2] as Handler;
    await handler([{ data: envelope('a') }, { data: envelope('b') }, { data: envelope('c') }]);
    expect(processed).toEqual(['a', 'b', 'c']);
  });
});
