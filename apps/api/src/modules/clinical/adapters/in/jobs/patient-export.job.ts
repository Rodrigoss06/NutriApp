import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { PatientExportCommands } from '../../../application/commands/patient-export.commands.js';

/** Cada hora: borra el archivo de las exportaciones que vencieron y da por fallidas las que no terminaron (RN-B04, ADR-131). */
@Injectable()
export class PatientExportJob implements OnModuleInit {
  readonly #logger = new Logger(PatientExportJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly commands: PatientExportCommands,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'clinical.exports-close',
      cron: '7 * * * *',
      run: async () => {
        const { closed, notDiscarded } = await this.commands.closeDue();
        this.#logger.log(`Exportaciones cerradas: ${String(closed)}`);
        if (notDiscarded > 0) {
          this.#logger.warn(
            `Archivos de exportaciones vencidas sin borrar del almacenamiento: ${String(notDiscarded)}`,
          );
        }
      },
    });
  }
}
