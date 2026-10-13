import { Inject, Injectable } from '@nestjs/common';
import type { TimelineCursor, TimelineEntry, TimelineSource } from '../../clinical/index.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  type EnergyPrescriptionStore,
} from './ports/nutrition.ports.js';

/** Las prescripciones energéticas en la línea de tiempo del expediente (RF-10). */
@Injectable()
export class NutritionTimelineSource implements TimelineSource {
  constructor(
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
  ) {}

  entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    return this.prescriptions.timeline(patientId, before, limit);
  }
}
