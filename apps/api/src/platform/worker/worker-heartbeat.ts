import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

/**
 * Mantiene vivo el worker y deja constancia de que corre. P2 le da trabajo de verdad: el despacho
 * del outbox con pg-boss y el mantenimiento diario de particiones.
 */
@Injectable()
export class WorkerHeartbeat implements OnApplicationBootstrap, OnApplicationShutdown {
  static readonly intervalMs = 60_000;

  readonly #logger = new Logger(WorkerHeartbeat.name);
  #timer: ReturnType<typeof setInterval> | undefined;

  get running(): boolean {
    return this.#timer !== undefined;
  }

  onApplicationBootstrap(): void {
    this.#logger.log('Worker iniciado');
    this.#timer = setInterval(() => {
      this.#logger.debug('Worker activo');
    }, WorkerHeartbeat.intervalMs);
  }

  onApplicationShutdown(signal?: string): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#logger.log(`Worker detenido (${signal ?? 'cierre de la aplicación'})`);
  }
}
