import { Module, type OnModuleInit } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { ClinicalApi } from '../clinical/index.js';
import { ExerciseModule } from '../exercise/index.js';
import {
  PatientProgramsController,
  ProgramController,
} from './adapters/in/http/program.controller.js';
import { TrainingSafetyController } from './adapters/in/http/training-safety.controller.js';
import { PrismaProgramStore } from './adapters/out/persistence/prisma-program.store.js';
import { PrismaAthleteProfileStore } from './adapters/out/persistence/prisma-athlete-profile.store.js';
import { AthleteProfileCommands } from './application/commands/athlete-profile.commands.js';
import { ProgramCommands } from './application/commands/program.commands.js';
import { PROGRAM_STORE } from './application/ports/program.ports.js';
import { ATHLETE_PROFILE_STORE } from './application/ports/training.ports.js';
import { ProgramQueries } from './application/queries/program.queries.js';
import { TrainingApi } from './application/training-api.js';
import { TrainingTimelineSource } from './application/training-timeline.js';
import { TrainingSafetyQueries } from './application/queries/training-safety.queries.js';
import { TrainingSafety } from './application/training-safety.js';

/**
 * training (02 §2, núcleo): el perfil de entrenamiento, las llaves de seguridad (RF-41) y el programa con su propuesta (RF-26).
 * Lee la postura de assessment, el cribado de clinical y la biblioteca de exercise por sus API públicas.
 */
@Module({
  imports: [AssessmentModule, ExerciseModule],
  controllers: [TrainingSafetyController, PatientProgramsController, ProgramController],
  providers: [
    AthleteProfileCommands,
    TrainingSafetyQueries,
    TrainingSafety,
    ProgramCommands,
    ProgramQueries,
    TrainingApi,
    TrainingTimelineSource,
    { provide: ATHLETE_PROFILE_STORE, useClass: PrismaAthleteProfileStore },
    { provide: PROGRAM_STORE, useClass: PrismaProgramStore },
  ],
  exports: [TrainingApi],
})
export class TrainingModule implements OnModuleInit {
  constructor(
    private readonly clinical: ClinicalApi,
    private readonly timeline: TrainingTimelineSource,
  ) {}

  onModuleInit(): void {
    this.clinical.registerTimelineSource(this.timeline);
  }
}
