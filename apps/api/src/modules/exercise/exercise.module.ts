import { Module } from '@nestjs/common';
import { ActivityQueries } from './application/activity.queries.js';
import { SaveActivitiesHandler } from './application/commands/save-activities.handler.js';
import { ExerciseApi, PHYSICAL_ACTIVITY_STORE } from './application/exercise-api.js';
import { PhysicalActivityController } from './adapters/in/http/physical-activity.controller.js';
import { CompendiumActivitiesImport } from './adapters/in/imports/compendium-activities.import.js';
import { PrismaPhysicalActivityStore } from './adapters/out/persistence/prisma-physical-activity.store.js';

/**
 * exercise (02 §2): por ahora, el catálogo de actividades con MET y su carga desde el Compendium 2024; la biblioteca de
 * ejercicios llega en P12.
 */
@Module({
  controllers: [PhysicalActivityController],
  providers: [
    ExerciseApi,
    ActivityQueries,
    SaveActivitiesHandler,
    CompendiumActivitiesImport,
    { provide: PHYSICAL_ACTIVITY_STORE, useClass: PrismaPhysicalActivityStore },
  ],
  exports: [ExerciseApi],
})
export class ExerciseModule {}
