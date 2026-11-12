import { Module, type OnModuleInit } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { ClinicalModule } from '../clinical/index.js';
import { ExerciseModule } from '../exercise/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { TenancyModule } from '../tenancy/index.js';
import { TrackingModule } from '../tracking/index.js';
import { MesocycleReportSources, TrainingModule } from '../training/index.js';
import { DailySummaryConsumer } from './adapters/in/events/daily-summary.consumer.js';
import { OverviewConsumer } from './adapters/in/events/overview.consumer.js';
import { TrainingWeeksConsumer } from './adapters/in/events/training-weeks.consumer.js';
import { OverviewController } from './adapters/in/http/overview.controller.js';
import { PatientAnalyticsController } from './adapters/in/http/patient-analytics.controller.js';
import { DailyRefreshJob } from './adapters/in/jobs/daily-refresh.job.js';
import { OverviewRefreshJob } from './adapters/in/jobs/overview-refresh.job.js';
import { PrismaAnalyticsStore } from './adapters/out/persistence/prisma-analytics.store.js';
import { DailyProjection } from './application/daily-projection.js';
import { DailyRefresh } from './application/daily-refresh.js';
import { AnalyticsMesocycleReportSource } from './application/mesocycle-report.source.js';
import { OverviewProjection } from './application/overview-projection.js';
import { OverviewRefresh } from './application/overview-refresh.js';
import { ANALYTICS_STORE } from './application/ports/analytics.ports.js';
import { DietQueries } from './application/queries/diet.queries.js';
import { OverviewQueries } from './application/queries/overview.queries.js';
import { TrainingQueries } from './application/queries/training.queries.js';
import { AnalyticsRebuild } from './application/rebuild.js';
import { TrainingProjection } from './application/training-projection.js';

/**
 * analytics (02 §2, soporte): read models que se reconstruyen desde las tablas de origen (05.3). El resumen diario lo recalculan
 * los eventos de tracking y un trabajo de cada hora, igual que el 1RM de cada día y el volumen semanal por grupo; la analítica de
 * dieta y la de rutina los leen sin sumar registros por petición (RF-32, RF-33). El panel del profesional guarda una fila por paciente
 * con sus alertas (RF-34).
 */
@Module({
  imports: [
    TenancyModule,
    ClinicalModule,
    AssessmentModule,
    NutritionModule,
    TrainingModule,
    TrackingModule,
    ExerciseModule,
  ],
  controllers: [PatientAnalyticsController, OverviewController],
  providers: [
    DailyProjection,
    TrainingProjection,
    DailyRefresh,
    OverviewProjection,
    OverviewRefresh,
    AnalyticsRebuild,
    DietQueries,
    TrainingQueries,
    OverviewQueries,
    DailySummaryConsumer,
    OverviewConsumer,
    TrainingWeeksConsumer,
    DailyRefreshJob,
    OverviewRefreshJob,
    AnalyticsMesocycleReportSource,
    { provide: ANALYTICS_STORE, useClass: PrismaAnalyticsStore },
  ],
  exports: [AnalyticsRebuild],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(
    private readonly reportSources: MesocycleReportSources,
    private readonly reportSource: AnalyticsMesocycleReportSource,
  ) {}

  /** El informe del mesociclo de training lee los entrenos y los 1RM de aquí, sin importar analytics (02 §4). */
  onModuleInit(): void {
    this.reportSources.register(this.reportSource);
  }
}
