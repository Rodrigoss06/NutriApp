import { Injectable } from '@nestjs/common';

/** Un trabajo programado del worker: cola de pg-boss, cron en UTC y lo que hace. */
export interface ScheduledJob {
  /** contexto.nombre: nombra la cola. */
  readonly queue: string;
  readonly cron: string;
  run(): Promise<void>;
}

const QUEUE_NAME = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

/** Los módulos registran aquí sus trabajos al iniciar; el worker los programa (01 §4). */
@Injectable()
export class JobRegistry {
  readonly #jobs = new Map<string, ScheduledJob>();

  register(job: ScheduledJob): void {
    if (!QUEUE_NAME.test(job.queue)) throw new Error(`Nombre de trabajo inválido: «${job.queue}».`);
    if (this.#jobs.has(job.queue)) throw new Error(`Trabajo duplicado: «${job.queue}».`);
    this.#jobs.set(job.queue, job);
  }

  all(): readonly ScheduledJob[] {
    return [...this.#jobs.values()];
  }
}
