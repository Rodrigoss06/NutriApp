import { Inject, Injectable } from '@nestjs/common';
import type { TimelineCursor, TimelineEntry, TimelineSource } from '../../clinical/index.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
  type EnergyPrescriptionStore,
  type NutritionPlanStore,
} from './ports/nutrition.ports.js';

/** Por fecha e id descendentes, como pide el cursor de la línea de tiempo. */
const newestFirst = (a: TimelineEntry, b: TimelineEntry): number =>
  b.occurredAt.getTime() - a.occurredAt.getTime() || (a.refId < b.refId ? 1 : -1);

/** Las prescripciones energéticas y los planes publicados en la línea de tiempo del expediente (RF-10). */
@Injectable()
export class NutritionTimelineSource implements TimelineSource {
  constructor(
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
    @Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore,
  ) {}

  async entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const prescriptions = await this.prescriptions.timeline(patientId, before, limit);
    const plans = await this.plans.timeline(patientId, before, limit);
    return [...prescriptions, ...plans].sort(newestFirst).slice(0, limit);
  }
}
