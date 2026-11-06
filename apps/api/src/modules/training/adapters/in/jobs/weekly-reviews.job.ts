import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { WeeklyReviewsHandler } from '../../../application/weekly-reviews.handler.js';

/** Cada hora: el control de las semanas que ya cerraron en la fecha local de cada paciente (07 §10). */
@Injectable()
export class WeeklyReviewsJob implements OnModuleInit {
  readonly #logger = new Logger(WeeklyReviewsJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly handler: WeeklyReviewsHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'training.weekly-reviews',
      cron: '40 * * * *',
      run: async () => {
        const written = await this.handler.execute();
        this.#logger.log(`Controles semanales calculados: ${String(written)}`);
      },
    });
  }
}
