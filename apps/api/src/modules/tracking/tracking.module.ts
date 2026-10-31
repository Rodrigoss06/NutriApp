import { Module } from '@nestjs/common';
import { NutritionModule } from '../nutrition/index.js';
import { TrainingModule } from '../training/index.js';
import { PlansConsumer } from './adapters/in/events/plans.consumer.js';
import { ProgramsConsumer } from './adapters/in/events/programs.consumer.js';
import { DailyTargetsJob } from './adapters/in/jobs/daily-targets.job.js';
import { PrismaTrackingStore } from './adapters/out/persistence/prisma-tracking.store.js';
import { DailyTargetsHandler } from './application/daily-targets.handler.js';
import { PlanActivation } from './application/plan-activation.js';
import { TRACKING_STORE } from './application/ports/tracking.ports.js';
import { ProgramActivation } from './application/program-activation.js';

/**
 * tracking (02 §2, núcleo): por ahora, la copia del plan y del programa vigentes y la meta de cada día, que alimentan los eventos de
 * nutrition (02 §3). Los registros del paciente llegan en P13.
 */
@Module({
  imports: [NutritionModule, TrainingModule],
  providers: [
    PlanActivation,
    ProgramActivation,
    DailyTargetsHandler,
    PlansConsumer,
    ProgramsConsumer,
    DailyTargetsJob,
    { provide: TRACKING_STORE, useClass: PrismaTrackingStore },
  ],
})
export class TrackingModule {}
