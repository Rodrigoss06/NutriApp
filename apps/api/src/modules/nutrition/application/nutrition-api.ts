import { Inject, Injectable } from '@nestjs/common';
import type { MethodCode } from '@nutricoach/engine';
import type { EnergyGoal, EnergyStrategy } from '../domain/energy-rules.js';
import type { EnergyComponent } from './energy-calculation.js';
import type { PlanSnapshot } from './plan-document.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
  type EnergyPrescriptionStore,
  type NutritionPlanStore,
} from './ports/nutrition.ports.js';

/** Un plan publicado tal como se congeló (RN-E15). */
export interface PublishedPlan {
  readonly planId: string;
  readonly patientId: string;
  readonly status: 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
  readonly snapshot: PlanSnapshot;
}

/**
 * De dónde salen las metas de un plan, cada número con su método (RN-D02): la TMR, el GET con su PAL, el ajuste del
 * objetivo y el reparto de macronutrientes. Una prescripción no se edita, así que esto no cambia.
 */
export interface EnergySummary {
  readonly rmr: { readonly methodCode: MethodCode; readonly kcal: number };
  readonly tee: { readonly methodCode: MethodCode; readonly kcal: number };
  readonly strategy: EnergyStrategy;
  readonly pal: number;
  readonly exerciseKcal: number;
  readonly goal: EnergyGoal;
  /** Negativo es un déficit. */
  readonly adjustmentKcal: number;
  readonly targetKcal: number;
  readonly macros: {
    readonly methodCode: MethodCode;
    readonly proteinGPerKg: number;
    readonly fatPctKcal: number;
  };
  readonly weightKg: number;
}

const output = (component: EnergyComponent, key: string): number => {
  const value = component.outputs[key];
  if (typeof value !== 'number') throw new Error(`Salida ${key} sin número.`);
  return value;
};

/**
 * API pública de nutrition (02 §2): lo que otros contextos leen de un plan publicado, como la copia que guarda tracking
 * (02 §3). Se llama dentro de la transacción de quien la usa.
 */
@Injectable()
export class NutritionApi {
  constructor(
    @Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore,
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
  ) {}

  async publishedPlan(planId: string): Promise<PublishedPlan | null> {
    const plan = await this.plans.find(planId);
    if (!plan || plan.status === 'DRAFT') return null;
    const snapshot = await this.plans.snapshot(planId);
    return snapshot ? { planId, patientId: plan.patientId, status: plan.status, snapshot } : null;
  }

  /** El estado de un plan; null si no existe o el contexto no lo ve (RN-A05). */
  async planStatus(
    planId: string,
  ): Promise<'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED' | null> {
    return (await this.plans.find(planId))?.status ?? null;
  }

  /** Las metas de una prescripción con sus métodos, para las fichas (RN-H04); null si el contexto no la ve. */
  async energySummary(prescriptionId: string): Promise<EnergySummary | null> {
    const record = await this.prescriptions.find(prescriptionId);
    if (!record) return null;
    const { rmr, tee, adjustment, macros } = record.components;
    return {
      rmr: { methodCode: rmr.methodCode, kcal: output(rmr, 'rmrKcal') },
      tee: { methodCode: tee.methodCode, kcal: output(tee, 'teeKcal') },
      strategy: record.strategy,
      pal: record.pal,
      exerciseKcal: output(tee, 'exerciseKcal'),
      goal: record.goal,
      adjustmentKcal: -output(adjustment, 'deficitKcal'),
      targetKcal: output(adjustment, 'targetKcal'),
      macros: {
        methodCode: macros.methodCode,
        proteinGPerKg: record.proteinGPerKg,
        fatPctKcal: record.fatPctKcal,
      },
      weightKg: record.weightKg,
    };
  }
}
