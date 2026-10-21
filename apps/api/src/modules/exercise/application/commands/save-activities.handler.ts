import { Inject, Injectable } from '@nestjs/common';
import type { CompendiumActivity } from '../../domain/compendium-activity.js';
import { PHYSICAL_ACTIVITY_STORE, type PhysicalActivityStore } from '../exercise-api.js';

/** La versión del Compendium que se carga; queda en exercise.physical_activity.source_version. */
export const COMPENDIUM_VERSION = 'COMPENDIUM_2024';

/** Guarda las actividades del Compendium dentro de la transacción del lote de importación (RN-I01, RN-I04). */
@Injectable()
export class SaveActivitiesHandler {
  constructor(
    @Inject(PHYSICAL_ACTIVITY_STORE) private readonly activities: PhysicalActivityStore,
  ) {}

  execute(activities: readonly CompendiumActivity[]): Promise<void> {
    return this.activities.upsert(activities, COMPENDIUM_VERSION);
  }
}
