import type { DailyTarget } from '../../domain/active-plan.js';

export interface ActiveNutritionPlan {
  readonly patientId: string;
  readonly planId: string;
  /** ISO 8601: cuándo se publicó, para que la copia solo avance (RN-E14). */
  readonly publishedAt: string;
  readonly target: DailyTarget;
}

/**
 * tracking.active_plan_view y tracking.daily_target, con la transacción de quien llama: la del consumidor o la del
 * trabajo diario, con el contexto SYSTEM de la organización.
 */
export interface TrackingStore {
  /** El plan nutricional vigente del paciente, bloqueado hasta el fin de la transacción. */
  activeNutritionPlan(patientId: string): Promise<ActiveNutritionPlan | null>;
  saveActiveNutritionPlan(plan: {
    readonly patientId: string;
    readonly organizationId: string;
    readonly planId: string;
    readonly snapshot: unknown;
    readonly effectiveFrom: string;
  }): Promise<void>;
  /** Los planes vigentes de la organización del contexto. */
  activeNutritionPlans(): Promise<readonly ActiveNutritionPlan[]>;
  /**
   * La meta de un día. REPLACE la cambia si ya existía (el plan de hoy cambió); KEEP no toca la que ya está. Devuelve si
   * escribió.
   */
  setDailyTarget(
    row: {
      readonly patientId: string;
      readonly organizationId: string;
      readonly localDate: string;
      readonly planId: string;
      readonly target: DailyTarget;
    },
    mode: 'REPLACE' | 'KEEP',
  ): Promise<boolean>;
}

export const TRACKING_STORE = Symbol.for('nutricoach.tracking.TrackingStore');
