import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { RemindersHandler } from '../../../application/reminders.handler.js';

/** Cada 15 minutos: los recordatorios de las citas confirmadas que empiezan dentro de las próximas 24 horas (RN-J02). */
@Injectable()
export class RemindersJob implements OnModuleInit {
  readonly #logger = new Logger(RemindersJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly handler: RemindersHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'scheduling.reminders',
      cron: '*/15 * * * *',
      run: async () => {
        const requested = await this.handler.execute();
        this.#logger.log(`Recordatorios de citas pedidos: ${String(requested)}`);
      },
    });
  }
}
