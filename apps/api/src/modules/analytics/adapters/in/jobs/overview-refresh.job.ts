import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { OverviewRefresh } from '../../../application/overview-refresh.js';

/** Cada hora, después del resumen diario (minuto 25) y de los controles semanales (minuto 40): el panel del profesional. */
@Injectable()
export class OverviewRefreshJob implements OnModuleInit {
  readonly #logger = new Logger(OverviewRefreshJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly refresh: OverviewRefresh,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'analytics.overview-refresh',
      cron: '50 * * * *',
      run: async () => {
        const patients = await this.refresh.execute();
        this.#logger.log(`Panel del profesional recalculado: ${String(patients)} pacientes`);
      },
    });
  }
}
