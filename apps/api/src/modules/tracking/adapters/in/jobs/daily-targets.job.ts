import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { DailyTargetsHandler } from '../../../application/daily-targets.handler.js';

/** RN-G03 cada hora: el día local de cada paciente empieza a distinta hora según su zona horaria. */
@Injectable()
export class DailyTargetsJob implements OnModuleInit {
  readonly #logger = new Logger(DailyTargetsJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly handler: DailyTargetsHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'tracking.daily-targets',
      cron: '15 * * * *',
      run: async () => {
        const created = await this.handler.execute();
        this.#logger.log(`Metas diarias creadas: ${String(created)}`);
      },
    });
  }
}
