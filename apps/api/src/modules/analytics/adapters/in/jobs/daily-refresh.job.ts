import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { DailyRefresh } from '../../../application/daily-refresh.js';

/** Cada hora, después de las metas del día de tracking (minuto 15): el resumen de ayer y de hoy de cada paciente activo. */
@Injectable()
export class DailyRefreshJob implements OnModuleInit {
  readonly #logger = new Logger(DailyRefreshJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly refresh: DailyRefresh,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'analytics.daily-refresh',
      cron: '25 * * * *',
      run: async () => {
        const patients = await this.refresh.execute();
        this.#logger.log(`Resúmenes diarios recalculados: ${String(patients)} pacientes`);
      },
    });
  }
}
