import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { NutritionApi } from '../../nutrition/index.js';
import { dailyTargetOf, localDate, replacesActivePlan } from '../domain/active-plan.js';
import { dayProfileOf } from '../domain/active-program.js';
import { addDays } from '../domain/day-changes.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from './ports/day-changes.ports.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';

/**
 * Al publicarse un plan (02 §8), tracking guarda su copia (active_plan_view) para validar registros y fija la meta de
 * hoy, en la fecha local del paciente (RN-G03, RN-G04), la del perfil de día que pide el programa vigente (07 §2), con los cambios
 * del día (ADR-104). Los días anteriores no se tocan. Corre en la transacción del consumidor, con el contexto SYSTEM de la
 * organización.
 */
@Injectable()
export class PlanActivation {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRACKING_STORE) private readonly store: TrackingStore,
    @Inject(DAY_CHANGE_STORE) private readonly dayChanges: DayChangeStore,
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
    const today = localDate(this.clock.now(), patient.timezone);
    const program = await this.store.activeProgram(plan.patientId);
    const changes = await this.dayChanges.active(plan.patientId, addDays(today, -1), today);
    await this.store.setDailyTarget(
      {
        patientId: plan.patientId,
        organizationId,
        localDate: today,
        planId,
        target: dailyTargetOf(
          plan.snapshot,
          dayProfileOf(program?.calendar ?? null, today, changes),
        ),
      },
      'REPLACE',
    );
    return 'ACTIVATED';
  }
}
