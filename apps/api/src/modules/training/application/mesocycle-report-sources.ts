import { Injectable } from '@nestjs/common';
import type { MesocycleReportSource } from './ports/mesocycle-report.ports.js';

/**
 * Dónde training encuentra los entrenos y los 1RM del informe del mesociclo sin importar analytics, que ya importa training: analytics
 * registra su fuente al iniciar (02 §4, como WeekCheckinSources con tracking).
 */
@Injectable()
export class MesocycleReportSources {
  #source: MesocycleReportSource | null = null;

  register(source: MesocycleReportSource): void {
    this.#source = source;
  }

  get(): MesocycleReportSource {
    if (!this.#source) {
      throw new Error(
        'Falta la fuente del informe del mesociclo: analytics la registra al iniciar.',
      );
    }
    return this.#source;
  }
}
