import { Inject, Injectable } from '@nestjs/common';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import { NutritionApi } from '../../nutrition/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { TrainingApi } from '../../training/index.js';
import { dailySummary, type DailySummary } from '../domain/daily-summary.js';
import { oneRmPoints, type OneRmPoint } from '../domain/one-rm.js';
import { dayAdequacy } from './adequacy.js';
import { estimateOneRm } from './one-rm-estimate.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';

/**
 * El resumen diario del paciente (05.3, RF-32) y su 1RM estimado por ejercicio (RF-33, RN-F04): recalcula cada día del rango desde
 * lo que tracking guarda, con los ajustes del profesional aplicados (RN-G02) y la meta de ese día (RN-G03), y reemplaza esas filas. La misma función sirve al consumidor, al
 * trabajo de cada hora y a la reconstrucción: con los mismos datos da los mismos números. Corre en la transacción de quien llama,
 * como SYSTEM de la organización.
 */
@Injectable()
export class DailyProjection {
  constructor(
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(NutritionApi) private readonly nutrition: NutritionApi,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  /** Recalcula el rango y devuelve cuántos días escribió. */
  async refresh(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const days = await this.tracking.dailyFacts(patientId, from, to);
    const adequacy = dayAdequacy(
      await this.tenancy.adequacyRangePct(organizationId as OrganizationId),
    );
    const slotsOf = new Map<string, readonly string[] | null>();
    const rows: DailySummary[] = [];
    for (const day of days) {
      const planId = day.target?.nutritionPlanId ?? null;
      let slots = planId === null ? null : slotsOf.get(planId);
      if (planId !== null && slots === undefined) {
        const plan = await this.nutrition.publishedPlan(planId);
        slots = plan ? plan.snapshot.meals.map((meal) => meal.slotCode) : null;
        slotsOf.set(planId, slots);
      }
      rows.push(dailySummary(day, slots ?? null, adequacy));
    }
    await this.store.replaceDailySummaries(organizationId, patientId, from, to, rows);
    // La fórmula de 1RM es la del programa de cada entreno (RN-F04).
    const formulas = new Map<string, string | null>();
    for (const day of days) {
      for (const workout of day.workouts) {
        if (workout.programId === null || formulas.has(workout.programId)) continue;
        const program = await this.training.publishedProgram(workout.programId);
        formulas.set(workout.programId, program?.oneRmFormula ?? null);
      }
    }
    const points: OneRmPoint[] = days.flatMap((day) =>
      oneRmPoints(day, (programId) => formulas.get(programId) ?? null, estimateOneRm),
    );
    await this.store.replaceOneRm(organizationId, patientId, from, to, points);
    return rows.length;
  }
}
