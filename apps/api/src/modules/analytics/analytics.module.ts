import { Module } from '@nestjs/common';
import { ClinicalModule } from '../clinical/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { TenancyModule } from '../tenancy/index.js';
import { TrackingModule } from '../tracking/index.js';
import { DailySummaryConsumer } from './adapters/in/events/daily-summary.consumer.js';
import { PatientAnalyticsController } from './adapters/in/http/patient-analytics.controller.js';
import { DailyRefreshJob } from './adapters/in/jobs/daily-refresh.job.js';
import { PrismaAnalyticsStore } from './adapters/out/persistence/prisma-analytics.store.js';
import { DailyProjection } from './application/daily-projection.js';
import { DailyRefresh } from './application/daily-refresh.js';
import { ANALYTICS_STORE } from './application/ports/analytics.ports.js';
import { DietQueries } from './application/queries/diet.queries.js';
import { AnalyticsRebuild } from './application/rebuild.js';

/**
 * analytics (02 §2, soporte): read models que se reconstruyen desde las tablas de origen (05.3). El resumen diario lo recalculan
 * los eventos de tracking y un trabajo de cada hora; la analítica de dieta lo lee sin sumar registros por petición (RF-32).
 */
@Module({
  imports: [TenancyModule, ClinicalModule, NutritionModule, TrackingModule],
  controllers: [PatientAnalyticsController],
  providers: [
    DailyProjection,
    DailyRefresh,
    AnalyticsRebuild,
    DietQueries,
    DailySummaryConsumer,
    DailyRefreshJob,
    { provide: ANALYTICS_STORE, useClass: PrismaAnalyticsStore },
  ],
  exports: [AnalyticsRebuild],
})
export class AnalyticsModule {}
