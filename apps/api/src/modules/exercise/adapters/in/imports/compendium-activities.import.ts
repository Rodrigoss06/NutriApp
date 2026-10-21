import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportRegistry } from '../../../../../platform/index.js';
import { SaveActivitiesHandler } from '../../../application/commands/save-activities.handler.js';
import {
  COMPENDIUM_COLUMNS,
  parseCompendiumRow,
  type CompendiumActivity,
} from '../../../domain/compendium-activity.js';

/** COMPENDIUM_ACTIVITIES: seeds/exercise/compendium-2024.csv, el subconjunto traducido del Compendium 2024 (RF-38). */
@Injectable()
export class CompendiumActivitiesImport implements OnModuleInit {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly saveActivities: SaveActivitiesHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register<CompendiumActivity>({
      kind: 'COMPENDIUM_ACTIVITIES',
      columns: COMPENDIUM_COLUMNS,
      parse: parseCompendiumRow,
      key: (activity) => activity.code,
      save: (activities) => this.saveActivities.execute(activities),
    });
  }
}
