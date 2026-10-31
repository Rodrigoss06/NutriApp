import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { ExerciseModule } from '../exercise/index.js';
import { TrainingSafetyController } from './adapters/in/http/training-safety.controller.js';
import { PrismaAthleteProfileStore } from './adapters/out/persistence/prisma-athlete-profile.store.js';
import { AthleteProfileCommands } from './application/commands/athlete-profile.commands.js';
import { ATHLETE_PROFILE_STORE } from './application/ports/training.ports.js';
import { TrainingSafetyQueries } from './application/queries/training-safety.queries.js';
import { TrainingSafety } from './application/training-safety.js';

/**
 * training (02 §2, núcleo): el perfil de entrenamiento y las llaves de seguridad (RF-41). Lee la postura de assessment, el
 * cribado de clinical y el equipamiento de exercise por sus API públicas.
 */
@Module({
  imports: [AssessmentModule, ExerciseModule],
  controllers: [TrainingSafetyController],
  providers: [
    AthleteProfileCommands,
    TrainingSafetyQueries,
    TrainingSafety,
    { provide: ATHLETE_PROFILE_STORE, useClass: PrismaAthleteProfileStore },
  ],
  exports: [TrainingSafety],
})
export class TrainingModule {}
