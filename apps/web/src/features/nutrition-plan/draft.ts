import {
  SOLVED_GROUPS,
  type FIXED_GROUPS,
  type ExchangeGroupCode,
  type MealSlot,
  type NutritionPlan,
  type UpdateNutritionPlan,
} from '@nutricoach/contracts';
import { parseDecimal } from '@nutricoach/ui';

export type FixedGroup = (typeof FIXED_GROUPS)[number];
export type SolvedGroup = (typeof SOLVED_GROUPS)[number];

/** Hasta 8 tiempos de comida, como el contrato. */
export const MAX_MEALS = 8;

export interface FoodRow {
  readonly groupCode: ExchangeGroupCode;
  readonly foodId: string;
  readonly foodName: string;
  readonly grams: string;
  readonly householdText: string;
  /** Para sugerir los gramos de un intercambio (ADR-057). */
  readonly nutrientsPer100g: Readonly<Record<string, number | null>>;
}

export interface MealRow {
  readonly key: string;
  readonly slotCode: MealSlot;
  readonly name: string;
  /** HH:MM o vacío. */
  readonly timeOfDay: string;
  readonly sharePct: string;
  readonly foods: readonly FoodRow[];
}

/** El borrador como se escribe: textos, para que la persona pueda dejar un campo a medias. */
export interface PlanDraft {
  readonly fixed: Readonly<Record<FixedGroup, string>>;
  /** Ajuste a mano de almidones, carnes o grasas; sin la clave, lo da el método (RN-E08). */
  readonly overrides: Readonly<Partial<Record<SolvedGroup, string>>>;
  /** Reparto a mano de un grupo: un valor por tiempo de comida, en su orden (RN-E09). */
  readonly split: Readonly<Partial<Record<ExchangeGroupCode, readonly string[]>>>;
  readonly meals: readonly MealRow[];
  readonly hydrationMl: string;
  readonly instructions: string;
}

type PlanFields = Pick<
  NutritionPlan,
  'exchanges' | 'manualSplit' | 'meals' | 'hydrationTargetMl' | 'instructions'
>;

/** El borrador guardado, listo para editarse. */
export function draftOf(plan: PlanFields): PlanDraft {
  const servingsOf = (code: ExchangeGroupCode) =>
    plan.exchanges.find((e) => e.groupCode === code)?.servings ?? 0;
  const overrides: Partial<Record<SolvedGroup, string>> = {};
  for (const code of SOLVED_GROUPS) {
    if (plan.exchanges.find((e) => e.groupCode === code)?.manual) {
      overrides[code] = String(servingsOf(code));
    }
  }
  return {
    fixed: {
      VEG: String(servingsOf('VEG')),
      FRU: String(servingsOf('FRU')),
      MILK: String(servingsOf('MILK')),
    },
    overrides,
    split: Object.fromEntries(
      plan.manualSplit.map((code) => [code, plan.meals.map((m) => String(m.servings[code]))]),
    ),
    meals: plan.meals.map((meal) => ({
      key: meal.id,
      slotCode: meal.slotCode,
      name: meal.name,
      timeOfDay: meal.timeOfDay ?? '',
      sharePct: String(meal.sharePct),
      foods: meal.allowedFoods.map((food) => ({
        groupCode: food.groupCode,
        foodId: food.foodId,
        foodName: food.foodName,
        grams: String(food.grams),
        householdText: food.householdText ?? '',
        nutrientsPer100g: food.nutrientsPer100g,
      })),
    })),
    hydrationMl: plan.hydrationTargetMl === null ? '' : String(plan.hydrationTargetMl),
    instructions: plan.instructions ?? '',
  };
}

const INTEGER = /^\d+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Intercambios de un grupo: entero de 0 a 99. */
export function servingsOf(text: string): number | null {
  const value = text.trim();
  return INTEGER.test(value) && Number(value) <= 99 ? Number(value) : null;
}

export function sharePctOf(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value >= 0 && value <= 100 ? value : null;
}

export function gramsOf(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value > 0 && value <= 9_999 ? value : null;
}

/** ml por día, entero de 1 a 10 000; vacío es «sin meta todavía». */
export function hydrationOf(text: string): number | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  return INTEGER.test(value) && Number(value) >= 1 && Number(value) <= 10_000
    ? Number(value)
    : undefined;
}

export const isTimeOfDay = (text: string): boolean => text === '' || TIME.test(text);

/**
 * El cuerpo de PUT y de la vista previa a partir del borrador, o null mientras algo falte o no sea un número válido:
 * entonces no se pide la vista previa. Las reglas del plan (porcentajes que suman 100, reparto a mano que suma el total
 * del día, alimentos solo donde hay intercambios) las decide la API y las explica en su 422.
 */
export function planBody(draft: PlanDraft): UpdateNutritionPlan | null {
  const VEG = servingsOf(draft.fixed.VEG);
  const FRU = servingsOf(draft.fixed.FRU);
  const MILK = servingsOf(draft.fixed.MILK);
  if (VEG === null || FRU === null || MILK === null) return null;
  const overrides: Partial<Record<SolvedGroup, number>> = {};
  for (const code of SOLVED_GROUPS) {
    const text = draft.overrides[code];
    if (text === undefined) continue;
    const value = servingsOf(text);
    if (value === null) return null;
    overrides[code] = value;
  }
  const splitOverrides: Partial<Record<ExchangeGroupCode, number[]>> = {};
  for (const [code, texts] of Object.entries(draft.split) as [ExchangeGroupCode, string[]][]) {
    const values = texts.map(servingsOf);
    if (values.some((v) => v === null)) return null;
    splitOverrides[code] = values as number[];
  }
  const meals: UpdateNutritionPlan['meals'] = [];
  for (const meal of draft.meals) {
    const name = meal.name.trim();
    const sharePct = sharePctOf(meal.sharePct);
    if (name === '' || name.length > 60 || sharePct === null || !isTimeOfDay(meal.timeOfDay)) {
      return null;
    }
    const allowedFoods: UpdateNutritionPlan['meals'][number]['allowedFoods'] = [];
    for (const food of meal.foods) {
      const grams = gramsOf(food.grams);
      const householdText = food.householdText.trim();
      if (grams === null || householdText.length > 120) return null;
      allowedFoods.push({
        groupCode: food.groupCode,
        foodId: food.foodId,
        grams,
        householdText: householdText === '' ? null : householdText,
      });
    }
    meals.push({
      slotCode: meal.slotCode,
      name,
      timeOfDay: meal.timeOfDay === '' ? null : meal.timeOfDay,
      sharePct,
      allowedFoods,
    });
  }
  const hydrationTargetMl = hydrationOf(draft.hydrationMl);
  const instructions = draft.instructions.trim();
  if (hydrationTargetMl === undefined || instructions.length > 2_000) return null;
  return {
    fixedServings: { VEG, FRU, MILK },
    overrides,
    meals,
    splitOverrides,
    hydrationTargetMl,
    instructions: instructions === '' ? null : instructions,
  };
}

/** Un tiempo de comida nuevo al final, sin nombre ni porcentaje; el reparto a mano le da 0 (RN-E09). */
export function withMeal(draft: PlanDraft, key: string): PlanDraft {
  return {
    ...draft,
    meals: [
      ...draft.meals,
      { key, slotCode: 'CUSTOM', name: '', timeOfDay: '', sharePct: '0', foods: [] },
    ],
    split: Object.fromEntries(
      Object.entries(draft.split).map(([code, values]) => [code, [...values, '0']]),
    ),
  };
}

export function withoutMeal(draft: PlanDraft, key: string): PlanDraft {
  const index = draft.meals.findIndex((m) => m.key === key);
  if (index < 0) return draft;
  return {
    ...draft,
    meals: draft.meals.filter((m) => m.key !== key),
    split: Object.fromEntries(
      Object.entries(draft.split).map(([code, values]) => [
        code,
        values.filter((_, i) => i !== index),
      ]),
    ),
  };
}

export function withMealChange(
  draft: PlanDraft,
  key: string,
  change: Partial<Omit<MealRow, 'key' | 'foods'>>,
): PlanDraft {
  return { ...draft, meals: draft.meals.map((m) => (m.key === key ? { ...m, ...change } : m)) };
}

/** Reparte un grupo a mano, partiendo de lo que daba el método; null lo devuelve al método (RN-E09). */
export function withManualSplit(
  draft: PlanDraft,
  code: ExchangeGroupCode,
  servings: readonly number[] | null,
): PlanDraft {
  const rest = without(draft.split, code);
  return servings === null
    ? { ...draft, split: rest }
    : { ...draft, split: { ...rest, [code]: servings.map(String) } };
}

export function withSplitValue(
  draft: PlanDraft,
  code: ExchangeGroupCode,
  index: number,
  text: string,
): PlanDraft {
  const values = draft.split[code];
  if (!values) return draft;
  return {
    ...draft,
    split: { ...draft.split, [code]: values.map((v, i) => (i === index ? text : v)) },
  };
}

/** Un alimento permitido más en un tiempo; el mismo alimento no se repite en un grupo del tiempo (RN-G05). */
export function withFood(draft: PlanDraft, mealKey: string, food: FoodRow): PlanDraft {
  return {
    ...draft,
    meals: draft.meals.map((m) =>
      m.key === mealKey && !hasFood(m, food.groupCode, food.foodId)
        ? { ...m, foods: [...m.foods, food] }
        : m,
    ),
  };
}

export function withFoodChange(
  draft: PlanDraft,
  mealKey: string,
  food: Pick<FoodRow, 'groupCode' | 'foodId'>,
  change: Partial<Pick<FoodRow, 'grams' | 'householdText'>> | null,
): PlanDraft {
  const same = (f: FoodRow) => f.groupCode === food.groupCode && f.foodId === food.foodId;
  return {
    ...draft,
    meals: draft.meals.map((m) =>
      m.key === mealKey
        ? {
            ...m,
            foods:
              change === null
                ? m.foods.filter((f) => !same(f))
                : m.foods.map((f) => (same(f) ? { ...f, ...change } : f)),
          }
        : m,
    ),
  };
}

/** El registro sin esa clave. */
export function without<K extends string, V>(
  record: Readonly<Partial<Record<K, V>>>,
  key: K,
): Partial<Record<K, V>> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Partial<
    Record<K, V>
  >;
}

export const hasFood = (meal: MealRow, groupCode: ExchangeGroupCode, foodId: string): boolean =>
  meal.foods.some((f) => f.groupCode === groupCode && f.foodId === foodId);
