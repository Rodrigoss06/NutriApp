import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import { ConsumerRunner } from '../events/consumer-runner.js';
import { ConsumerRegistry, type EventConsumer } from '../events/event-consumer.js';
import { OutboxDispatcher } from '../events/outbox-dispatcher.js';
import { JobRegistry } from '../jobs/job-registry.js';
import type { OutboxEnvelope } from '../events/outbox-envelope.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import {
  consumerQueue,
  DEAD_LETTER_QUEUE,
  PG_BOSS,
  RETRY_POLICY,
  type RetryPolicy,
} from '../queue/pg-boss.provider.js';

/** Trabajos diarios en UTC (01 §4): particiones de madrugada y limpieza después de la copia base de las 03:00. */
export const MAINTENANCE_JOBS = {
  partitions: { queue: 'platform.maintenance-partitions', cron: '0 2 * * *' },
  cleanup: { queue: 'platform.maintenance-cleanup', cron: '30 3 * * *' },
} as const;

/**
 * El worker (02 §1): arranca pg-boss, crea una cola por consumidor con reintentos y cola de errores, despacha
 * el outbox cada segundo y programa el mantenimiento diario. Logs con conteos, nunca datos de eventos.
 */
@Injectable()
export class WorkerRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  static readonly dispatchIntervalMs = 1_000;

  readonly #logger = new Logger(WorkerRuntime.name);
  #timer: ReturnType<typeof setInterval> | undefined;
  #dispatching = false;

  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    private readonly registry: ConsumerRegistry,
    private readonly jobs: JobRegistry,
    private readonly runner: ConsumerRunner,
    private readonly dispatcher: OutboxDispatcher,
    private readonly maintenance: MaintenanceService,
    @Inject(RETRY_POLICY) private readonly retry: RetryPolicy,
  ) {}

  get running(): boolean {
    return this.#timer !== undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(DEAD_LETTER_QUEUE);
    for (const consumer of this.registry.all()) await this.#listen(consumer);
    await this.#schedule(MAINTENANCE_JOBS.partitions, async () => {
      const created = await this.maintenance.ensurePartitions();
      this.#logger.log(`Particiones creadas: ${String(created)}`);
    });
    await this.#schedule(MAINTENANCE_JOBS.cleanup, async () => {
      const removed = await this.maintenance.cleanup();
      this.#logger.log(`Limpieza: ${JSON.stringify(removed)}`);
    });
    for (const job of this.jobs.all()) await this.#schedule(job, () => job.run());
    // Tras un despliegue no se espera a la madrugada: la partición del mes siguiente debe existir ya.
    await this.maintenance.ensurePartitions();
    this.#timer = setInterval(() => void this.#dispatch(), WorkerRuntime.dispatchIntervalMs);
    this.#logger.log(`Worker iniciado con ${String(this.registry.all().length)} consumidores`);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    clearInterval(this.#timer);
    this.#timer = undefined;
    await this.boss.stop({ graceful: true });
    this.#logger.log(`Worker detenido (${signal ?? 'cierre de la aplicación'})`);
  }

  async #listen(consumer: EventConsumer): Promise<void> {
    const queue = consumerQueue(consumer.name);
    await this.boss.createQueue(queue, { ...this.retry, deadLetter: DEAD_LETTER_QUEUE });
    for (const type of consumer.eventTypes) await this.boss.subscribe(type, queue);
    await this.boss.work<OutboxEnvelope>(queue, async (jobs) => {
      for (const job of jobs) await this.runner.process(consumer, job.data);
    });
  }

  async #schedule(job: { queue: string; cron: string }, run: () => Promise<void>): Promise<void> {
    await this.boss.createQueue(job.queue, { ...this.retry, deadLetter: DEAD_LETTER_QUEUE });
    await this.boss.schedule(job.queue, job.cron, null, { tz: 'UTC' });
    await this.boss.work(job.queue, run);
  }

  async #dispatch(): Promise<void> {
    if (this.#dispatching) return;
    this.#dispatching = true;
    try {
      await this.dispatcher.dispatchPending();
    } catch (error) {
      this.#logger.error(
        `Fallo al despachar el outbox: ${error instanceof Error ? error.name : 'desconocido'}`,
      );
    } finally {
      this.#dispatching = false;
    }
  }
}
