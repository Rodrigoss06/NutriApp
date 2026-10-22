import { canonicalJson, ENGINE_VERSION, sha256Hex } from '@nutricoach/engine';
import type { DailyExchange, ExchangeGroupCode, MealSlotCode } from '../domain/nutrition-plan.js';
import type { PlanCalculation, PlanList, PlanMethodRun, PlanTargets } from './plan-calculation.js';
import type { CalculatedPlan } from './plan-calculator.js';

export interface PlanDocumentFood {
  readonly groupCode: ExchangeGroupCode;
  readonly foodId: string;
  readonly foodName: string;
  readonly grams: number;
  readonly householdText: string | null;
  /** Energía, macronutrientes y fibra por 100 g de parte comestible; null es «sin dato» (RN-I03). */
  readonly nutrientsPer100g: Readonly<Record<string, number | null>>;
}

export interface PlanDocumentMeal {
  readonly id: string;
  readonly slotCode: MealSlotCode;
  readonly name: string;
  readonly timeOfDay: string | null;
  readonly sharePct: number;
  readonly servings: Readonly<Record<ExchangeGroupCode, number>>;
  readonly allowedFoods: readonly PlanDocumentFood[];
}

/** El plan entero, como lo calcula el motor: lo que muestra un borrador y lo que congela un snapshot. */
export interface PlanDocument {
  readonly targets: PlanTargets;
  readonly exchangeList: PlanList;
  readonly exchanges: readonly DailyExchange[];
  readonly manualSplit: readonly ExchangeGroupCode[];
  readonly meals: readonly PlanDocumentMeal[];
  readonly totals: PlanCalculation['totals'];
  readonly adequacy: PlanCalculation['adequacy'];
  readonly methods: readonly PlanMethodRun[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

export function planDocument(calculated: CalculatedPlan, mealIds: readonly string[]): PlanDocument {
  const { calculation, targets, list, foods } = calculated;
  const { plan } = calculation;
  return {
    targets,
    exchangeList: list,
    exchanges: plan.exchanges,
    manualSplit: plan.manualSplit,
    meals: plan.meals.map((meal, index) => ({
      id: mealIds[index] ?? '',
      slotCode: meal.slotCode,
      name: meal.name,
      timeOfDay: meal.timeOfDay,
      sharePct: meal.sharePct,
      servings: meal.servings,
      allowedFoods: meal.allowedFoods.map((food) => ({
        groupCode: food.groupCode,
        foodId: food.foodId,
        foodName: foods.get(food.foodId)?.name ?? '',
        grams: food.grams,
        householdText: food.householdText,
        nutrientsPer100g: foods.get(food.foodId)?.nutrientsPer100g ?? {},
      })),
    })),
    totals: calculation.totals,
    adequacy: calculation.adequacy,
    methods: calculation.methods,
    hydrationTargetMl: plan.hydrationTargetMl,
    instructions: plan.instructions,
  };
}

/** Versión del esquema del snapshot: la app y las fichas la leen antes de leer lo demás (05 §2). */
export const PLAN_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Lo que congela publicar (RN-E15): el plan con sus metas, su lista y su versión, el reparto, los alimentos permitidos
 * con sus nutrientes, la adecuación y cada método. La app del paciente y las fichas leen solo esto.
 */
export interface PlanSnapshot extends PlanDocument {
  readonly schemaVersion: typeof PLAN_SNAPSHOT_SCHEMA_VERSION;
  readonly planId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly patientId: string;
  readonly modality: 'EXCHANGES';
  readonly energyPrescriptionId: string;
  /** YYYY-MM-DD, fecha local del paciente. */
  readonly validFrom: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly engineVersion: string;
}

/** El snapshot y su hash: SHA-256 de su JSON canónico, para verificar que nada cambió (RN-H02). */
export function planSnapshot(
  document: PlanDocument,
  meta: Omit<PlanSnapshot, keyof PlanDocument | 'schemaVersion' | 'modality' | 'engineVersion'>,
): { readonly snapshot: PlanSnapshot; readonly hash: string } {
  const snapshot: PlanSnapshot = {
    schemaVersion: PLAN_SNAPSHOT_SCHEMA_VERSION,
    modality: 'EXCHANGES',
    engineVersion: ENGINE_VERSION,
    ...meta,
    ...document,
  };
  return { snapshot, hash: sha256Hex(canonicalJson(snapshot)) };
}
