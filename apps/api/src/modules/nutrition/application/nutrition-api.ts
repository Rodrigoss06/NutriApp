import { Inject, Injectable } from '@nestjs/common';
import type { PlanSnapshot } from './plan-document.js';
import { NUTRITION_PLAN_STORE, type NutritionPlanStore } from './ports/nutrition.ports.js';

/** Un plan publicado tal como se congeló (RN-E15). */
export interface PublishedPlan {
  readonly planId: string;
  readonly patientId: string;
  readonly status: 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
  readonly snapshot: PlanSnapshot;
}

/**
 * API pública de nutrition (02 §2): lo que otros contextos leen de un plan publicado, como la copia que guarda tracking
 * (02 §3). Se llama dentro de la transacción de quien la usa.
 */
@Injectable()
export class NutritionApi {
  constructor(@Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore) {}

  async publishedPlan(planId: string): Promise<PublishedPlan | null> {
    const plan = await this.plans.find(planId);
    if (!plan || plan.status === 'DRAFT') return null;
    const snapshot = await this.plans.snapshot(planId);
    return snapshot ? { planId, patientId: plan.patientId, status: plan.status, snapshot } : null;
  }
}
