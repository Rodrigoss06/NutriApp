import { Module, type OnModuleInit } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { FoodModule } from '../food/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { TrainingModule, WeekCheckinSources } from '../training/index.js';
import { DayChangesConsumer } from './adapters/in/events/day-changes.consumer.js';
import { PlansConsumer } from './adapters/in/events/plans.consumer.js';
import { MeTrackingController } from './adapters/in/http/me-tracking.controller.js';
import { PatientRecordsController } from './adapters/in/http/patient-records.controller.js';
import { ProgramsConsumer } from './adapters/in/events/programs.consumer.js';
import { DailyTargetsJob } from './adapters/in/jobs/daily-targets.job.js';
import { PrismaDayChangeStore } from './adapters/out/persistence/prisma-day-change.store.js';
import { PrismaFactsStore } from './adapters/out/persistence/prisma-facts.store.js';
import { PrismaRecordStore } from './adapters/out/persistence/prisma-record.store.js';
import { PrismaTrackingStore } from './adapters/out/persistence/prisma-tracking.store.js';
import { AdjustmentCommands } from './application/commands/adjustment.commands.js';
import { DayScheduleCommands } from './application/commands/day-schedule.commands.js';
import { RecordGate } from './application/commands/record-gate.js';
import { RecordCommands } from './application/commands/record.commands.js';
import { TrainingLogCommands } from './application/commands/training-log.commands.js';
import { DailyTargetsHandler } from './application/daily-targets.handler.js';
import { DayRetarget } from './application/day-retarget.js';
import { DayScheduleSource } from './application/day-schedule-source.js';
import { PlanActivation } from './application/plan-activation.js';
import { DAY_CHANGE_STORE } from './application/ports/day-changes.ports.js';
import { WEEKLY_CHECKIN_STORE } from './application/ports/weekly-checkin.ports.js';
import { WeeklyCheckinCommands } from './application/commands/weekly-checkin.commands.js';
import { PrismaWeeklyCheckinStore } from './adapters/out/persistence/prisma-weekly-checkin.store.js';
import { FACTS_STORE } from './application/ports/facts.ports.js';
import { RECORD_STORE } from './application/ports/records.ports.js';
import { TRACKING_STORE } from './application/ports/tracking.ports.js';
import { ProgramActivation } from './application/program-activation.js';
import { MeQueries } from './application/queries/me.queries.js';
import { PatientRecordsQueries } from './application/queries/patient-records.queries.js';
import { TrackingApi } from './application/tracking-api.js';
import { TrackingWeekCheckins } from './application/week-checkins.source.js';

/**
 * tracking (02 §2, núcleo): la copia del plan y del programa vigentes y la meta de cada día, que alimentan los eventos de nutrition y
 * training (02 §3), y lo que el paciente registra desde su app por /me (RN-G01 a RN-G17). TrackingApi da a la analítica los hechos
 * de cada día con los ajustes aplicados (RN-G02).
 */
@Module({
  imports: [NutritionModule, TrainingModule, FoodModule, ContentModule],
  controllers: [MeTrackingController, PatientRecordsController],
  providers: [
    RecordGate,
    RecordCommands,
    TrainingLogCommands,
    AdjustmentCommands,
    DayScheduleCommands,
    WeeklyCheckinCommands,
    DayScheduleSource,
    DayRetarget,
    DayChangesConsumer,
    { provide: DAY_CHANGE_STORE, useClass: PrismaDayChangeStore },
    { provide: WEEKLY_CHECKIN_STORE, useClass: PrismaWeeklyCheckinStore },
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
    TrackingApi,
    TrackingWeekCheckins,
    { provide: FACTS_STORE, useClass: PrismaFactsStore },
  ],
  exports: [TrackingApi],
})
export class TrackingModule implements OnModuleInit {
  constructor(
    private readonly sources: WeekCheckinSources,
    private readonly weekCheckins: TrackingWeekCheckins,
  ) {}

  /** El control semanal de training lee los registros diarios de aquí, sin importar tracking (02 §4). */
  onModuleInit(): void {
    this.sources.register(this.weekCheckins);
  }
}
