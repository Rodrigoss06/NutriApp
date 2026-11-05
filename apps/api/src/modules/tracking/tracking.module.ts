import { Module } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { FoodModule } from '../food/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { TrainingModule } from '../training/index.js';
import { PlansConsumer } from './adapters/in/events/plans.consumer.js';
import { MeTrackingController } from './adapters/in/http/me-tracking.controller.js';
import { PatientRecordsController } from './adapters/in/http/patient-records.controller.js';
import { ProgramsConsumer } from './adapters/in/events/programs.consumer.js';
import { DailyTargetsJob } from './adapters/in/jobs/daily-targets.job.js';
import { PrismaRecordStore } from './adapters/out/persistence/prisma-record.store.js';
import { PrismaTrackingStore } from './adapters/out/persistence/prisma-tracking.store.js';
import { AdjustmentCommands } from './application/commands/adjustment.commands.js';
import { RecordGate } from './application/commands/record-gate.js';
import { RecordCommands } from './application/commands/record.commands.js';
import { TrainingLogCommands } from './application/commands/training-log.commands.js';
import { DailyTargetsHandler } from './application/daily-targets.handler.js';
import { PlanActivation } from './application/plan-activation.js';
import { RECORD_STORE } from './application/ports/records.ports.js';
import { TRACKING_STORE } from './application/ports/tracking.ports.js';
import { ProgramActivation } from './application/program-activation.js';
import { MeQueries } from './application/queries/me.queries.js';
import { PatientRecordsQueries } from './application/queries/patient-records.queries.js';

/**
 * tracking (02 §2, núcleo): la copia del plan y del programa vigentes y la meta de cada día, que alimentan los eventos de nutrition y
 * training (02 §3), y lo que el paciente registra desde su app por /me (RN-G01 a RN-G17).
 */
@Module({
  imports: [NutritionModule, TrainingModule, FoodModule, ContentModule],
  controllers: [MeTrackingController, PatientRecordsController],
  providers: [
    RecordGate,
    RecordCommands,
    TrainingLogCommands,
    AdjustmentCommands,
    MeQueries,
    PatientRecordsQueries,
    { provide: RECORD_STORE, useClass: PrismaRecordStore },
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
