import { Module } from '@nestjs/common';
import { ActivityQueries } from './application/activity.queries.js';
import { OwnExerciseCommands } from './application/commands/own-exercise.commands.js';
import { PatternChoiceCommands } from './application/commands/pattern-choice.commands.js';
import { SaveActivitiesHandler } from './application/commands/save-activities.handler.js';
import {
  SaveLibraryHandler,
  SavePatternChoicesHandler,
} from './application/commands/save-library.handlers.js';
import { ExerciseApi, PHYSICAL_ACTIVITY_STORE } from './application/exercise-api.js';
import { EXERCISE_STORE } from './application/ports/exercise.port.js';
import { ExerciseQueries } from './application/queries/exercise.queries.js';
import {
  ExerciseController,
  PatternChoiceController,
} from './adapters/in/http/exercise.controller.js';
import { PhysicalActivityController } from './adapters/in/http/physical-activity.controller.js';
import { CompendiumActivitiesImport } from './adapters/in/imports/compendium-activities.import.js';
import { ExerciseLibraryImport } from './adapters/in/imports/exercise-library.import.js';
import { PrismaExerciseStore } from './adapters/out/persistence/prisma-exercise.store.js';
import { PrismaPhysicalActivityStore } from './adapters/out/persistence/prisma-physical-activity.store.js';

/**
 * exercise (02 §2): el catálogo de actividades con MET y su carga desde el Compendium 2024, y la biblioteca de ejercicios
 * con su tabla patrón × nivel, global y de cada organización (RF-25, RF-38, RN-I01).
 */
@Module({
  controllers: [PhysicalActivityController, ExerciseController, PatternChoiceController],
  providers: [
    ExerciseApi,
    ActivityQueries,
    ExerciseQueries,
    OwnExerciseCommands,
    PatternChoiceCommands,
    SaveActivitiesHandler,
    SaveLibraryHandler,
    SavePatternChoicesHandler,
    CompendiumActivitiesImport,
    ExerciseLibraryImport,
    { provide: PHYSICAL_ACTIVITY_STORE, useClass: PrismaPhysicalActivityStore },
    { provide: EXERCISE_STORE, useClass: PrismaExerciseStore },
  ],
  exports: [ExerciseApi],
})
export class ExerciseModule {}
