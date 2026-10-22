import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { NutritionApi } from '../../nutrition/index.js';
import { dailyTargetOf, localDate, replacesActivePlan } from '../domain/active-plan.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';

/**
 * Al publicarse un plan (02 §8), tracking guarda su copia (active_plan_view) para validar registros y fija la meta de
 * hoy, en la fecha local del paciente (RN-G03, RN-G04). Los días anteriores no se tocan. Corre en la transacción del
 * consumidor, con el contexto SYSTEM de la organización.
 */
@Injectable()
export class PlanActivation {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRACKING_STORE) private readonly store: TrackingStore,
    @Inject(NutritionApi) private readonly nutrition: NutritionApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  async activate(organizationId: string, planId: string): Promise<'ACTIVATED' | 'IGNORED'> {
    const plan = await this.nutrition.publishedPlan(planId);
    if (!plan) return 'IGNORED';
    const active = await this.store.activeNutritionPlan(plan.patientId);
    if (!replacesActivePlan(active?.publishedAt ?? null, plan.snapshot.publishedAt))
      return 'IGNORED';
    const patient = await this.clinical.patientRef(plan.patientId);
    if (!patient) return 'IGNORED';
    await this.store.saveActiveNutritionPlan({
      patientId: plan.patientId,
      organizationId,
      planId,
      snapshot: plan.snapshot,
      effectiveFrom: plan.snapshot.validFrom,
    });
    await this.store.setDailyTarget(
      {
        patientId: plan.patientId,
        organizationId,
        localDate: localDate(this.clock.now(), patient.timezone),
        planId,
        target: dailyTargetOf(plan.snapshot),
      },
      'REPLACE',
    );
    return 'ACTIVATED';
  }
}
