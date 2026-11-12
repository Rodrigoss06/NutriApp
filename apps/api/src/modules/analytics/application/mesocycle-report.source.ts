import { Inject, Injectable } from '@nestjs/common';
import { TrackingApi } from '../../tracking/index.js';
import type {
  MesocycleReportSource,
  ReportOneRmPoint,
  ReportWorkout,
} from '../../training/index.js';
import { CARDIO_MUSCLE } from '../domain/daily-summary.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';

/**
 * Lo que analytics da al informe del mesociclo de training (P14.5, PR 7a; ADR-117): los entrenos del rango con los ajustes del
 * profesional aplicados (RN-G02), como los lee la analítica de rutina, y los 1RM de su read model (RN-F04). En la transacción de quien
 * llama y con su RLS.
 */
@Injectable()
export class AnalyticsMesocycleReportSource implements MesocycleReportSource {
  constructor(
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  async workouts(patientId: string, from: string, to: string): Promise<readonly ReportWorkout[]> {
    const days = await this.tracking.dailyFacts(patientId, from, to);
    return days.flatMap((day) =>
      day.workouts.map((workout) => ({
        outcome: workout.outcome,
        programId: workout.programId,
        weekNo: workout.weekNo,
        sets: workout.sets.map((set) => ({
          isWarmup: set.isWarmup,
          isCardio: set.muscleContributions.some((c) => c.muscle === CARDIO_MUSCLE),
        })),
      })),
    );
  }

  async oneRm(patientId: string, from: string, to: string): Promise<readonly ReportOneRmPoint[]> {
    return (await this.store.oneRmSeries(patientId, from, to)).map((point) => ({
      localDate: point.localDate,
      exerciseId: point.exerciseId,
      formula: point.formula,
      estimated1rmKg: point.bestEstimated1rmKg,
    }));
  }
}
