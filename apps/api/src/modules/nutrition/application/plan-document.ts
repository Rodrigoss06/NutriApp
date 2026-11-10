import { canonicalJson, ENGINE_VERSION, sha256Hex } from '@nutricoach/engine';
import type { FoodItem, MealHeader, RecipeItem } from '../domain/food-plan.js';
import type { DailyExchange, ExchangeGroupCode, MealSlotCode } from '../domain/nutrition-plan.js';
import type {
  FoodAdequacyBlock,
  ItemTotals,
  PlanFoodData,
  PlanNutrient,
  WeeklyAverage,
} from './food-plan-calculation.js';
import type {
  ExchangeAdequacy,
  MacroTotals,
  PlanCalculation,
  PlanList,
  PlanMethodRun,
  PlanTargets,
} from './plan-calculation.js';
import type {
  CalculatedComposition,
  CalculatedPlan,
  CalculatedWeeklyMenu,
} from './plan-calculator.js';
import type { DayProfileTargets } from './day-profiles.js';

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

/**
 * Las porciones de un perfil en intercambios (07 §2, P-20.5): los almidones de cada tiempo, en su orden (los demás grupos son
 * los del plan), con los totales del día y su adecuación frente a las metas del perfil (RN-E10).
 */
export interface ExchangeProfilePortions {
  readonly starchByMeal: readonly number[];
  /** El coach cambió la sugerencia de STARCH_BY_DAY_PROFILE. */
  readonly manual: boolean;
  readonly totals: MacroTotals;
  readonly adequacy: ExchangeAdequacy;
}

/** Lo de un perfil en composición: el día con sus cantidades y su adecuación (P-20.5, RN-E10). */
export interface CompositionProfilePortions {
  readonly totals: ItemTotals;
  readonly adequacy: FoodAdequacyBlock;
}

/** Lo de un perfil en el menú: el promedio y la adecuación de los siete días con sus cantidades (P-20.5, RN-E10). */
export interface MenuProfilePortions {
  readonly weeklyAverage: Readonly<Record<string, WeeklyAverage>>;
  readonly adequacy: FoodAdequacyBlock;
}

/**
 * Un perfil de día con sus metas, su método y sus porciones. Los snapshots de la versión 3 no traen las porciones: el perfil
 * lleva las del plan.
 */
export type DocumentDayProfile<TPortions> = DayProfileTargets & { readonly portions?: TPortions };

/** Un plan por intercambios entero, como lo calcula el motor: lo que muestra un borrador y lo que congela un snapshot. */
export interface ExchangePlanDocument {
  readonly modality: 'EXCHANGES';
  /** Las metas de la prescripción: las de Entrenamiento (07 §2). */
  readonly targets: PlanTargets;
  /**
   * Los demás perfiles de día con sus metas, su método y sus porciones (P-20); vacío, una sola meta. Los snapshots de las
   * versiones 1 y 2 no lo traen.
   */
  readonly dayProfiles?: readonly DocumentDayProfile<ExchangeProfilePortions>[];
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

/** byProfile falta en los snapshots anteriores a la versión 4: las cantidades del plan valen todos los días. */
export type DocumentFoodItem = Omit<FoodItem, 'byProfile'> & {
  readonly byProfile?: FoodItem['byProfile'];
  readonly foodName: string;
};
export type DocumentRecipeItem = Omit<RecipeItem, 'byProfile'> & {
  readonly byProfile?: RecipeItem['byProfile'];
  readonly recipeName: string;
};
export type DocumentMenuItem = DocumentFoodItem | DocumentRecipeItem;

/** Una receta del menú congelada: lo que rinde, sus ingredientes y lo de una porción (RN-E12). */
export interface DocumentRecipe {
  readonly name: string;
  readonly servings: number;
  readonly ingredients: readonly { readonly foodId: string; readonly grams: number }[];
  readonly perServing: ItemTotals;
}

/**
 * Lo común de composición y menú: el catálogo de nutrientes y cada alimento con todos sus nutrientes por 100 g. Un
 * snapshot lo congela: lo que el paciente registre desde su plan sale de aquí (RN-E15).
 */
interface FoodPlanDocumentBase {
  /** Las metas de la prescripción: las de Entrenamiento (07 §2). */
  readonly targets: PlanTargets;
  readonly nutrients: readonly PlanNutrient[];
  readonly foods: Readonly<Record<string, PlanFoodData>>;
  readonly adequacy: FoodAdequacyBlock;
  readonly methods: readonly PlanMethodRun[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/** Una dieta por composición entera (RF-20): cada tiempo con sus alimentos y sus totales, y los del día. */
export interface CompositionPlanDocument extends FoodPlanDocumentBase {
  readonly modality: 'COMPOSITION';
  /**
   * Los demás perfiles de día con sus metas, su método y sus porciones (P-20); vacío, una sola meta. Los snapshots de las
   * versiones 1 y 2 no lo traen.
   */
  readonly dayProfiles?: readonly DocumentDayProfile<CompositionProfilePortions>[];
  readonly meals: readonly (MealHeader & {
    readonly id: string;
    readonly items: readonly DocumentFoodItem[];
    readonly totals: ItemTotals;
  })[];
  readonly totals: ItemTotals;
}

export interface DocumentMenuCell {
  readonly id: string;
  readonly optionA: readonly DocumentMenuItem[];
  readonly optionB: readonly DocumentMenuItem[];
  readonly totalsA: ItemTotals | null;
  readonly totalsB: ItemTotals | null;
}

/** Un menú semanal entero (RF-21): de lunes a domingo, cada celda con sus opciones, y el promedio de la semana. */
export interface WeeklyMenuPlanDocument extends FoodPlanDocumentBase {
  readonly modality: 'WEEKLY_MENU';
  /**
   * Los demás perfiles de día con sus metas, su método y sus porciones (P-20); vacío, una sola meta. Los snapshots de las
   * versiones 1 y 2 no lo traen.
   */
  readonly dayProfiles?: readonly DocumentDayProfile<MenuProfilePortions>[];
  readonly meals: readonly MealHeader[];
  readonly days: readonly {
    readonly dayOfWeek: number;
    readonly meals: readonly DocumentMenuCell[];
    readonly totals: ItemTotals;
  }[];
  readonly weeklyAverage: Readonly<Record<string, WeeklyAverage>>;
  readonly recipes: Readonly<Record<string, DocumentRecipe>>;
}

export type PlanDocument = ExchangePlanDocument | CompositionPlanDocument | WeeklyMenuPlanDocument;

/** Cada perfil con sus porciones, las que calculó el motor para su código. */
function withPortions<TCalculated extends { readonly code: string }, TPortions>(
  profiles: readonly DayProfileTargets[],
  calculated: readonly TCalculated[],
  portionsOf: (found: TCalculated) => TPortions,
): DocumentDayProfile<TPortions>[] {
  return profiles.map((profile) => {
    const found = calculated.find((portions) => portions.code === profile.code);
    if (!found) throw new Error(`El perfil ${profile.code} sin sus porciones.`);
    return { ...profile, portions: portionsOf(found) };
  });
}

export function planDocument(
  calculated: CalculatedPlan,
  mealIds: readonly string[],
  profiles: readonly DayProfileTargets[] = [],
): ExchangePlanDocument {
  const { calculation, targets, list, foods } = calculated;
  const { plan } = calculation;
  return {
    modality: 'EXCHANGES',
    targets,
    dayProfiles: withPortions(profiles, calculation.profiles, (found) => ({
      starchByMeal: found.starchByMeal,
      manual: found.manual,
      totals: found.totals,
      adequacy: found.adequacy,
    })),
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

/** Lo calculado va en el mismo orden que el borrador: si falta algo, es una falla técnica. */
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Cálculo sin la posición ${String(index)}.`);
  return value;
}

const header = ({ slotCode, name, timeOfDay, sharePct }: MealHeader): MealHeader => ({
  slotCode,
  name,
  timeOfDay,
  sharePct,
});

/** Cada alimento usado, con su nombre, su estado y todos sus nutrientes por 100 g. */
function usedFoods(
  sources: CalculatedComposition['sources'],
  ids: readonly string[],
): Record<string, PlanFoodData> {
  return Object.fromEntries(
    [...new Set(ids)].flatMap((id) => {
      const food = sources.foods.get(id);
      return food ? [[id, food]] : [];
    }),
  );
}

/** Una dieta por composición; los id de los tiempos van en su orden (vacíos en una vista previa). */
export function compositionDocument(
  calculated: CalculatedComposition,
  mealIds: readonly string[],
  profiles: readonly DayProfileTargets[] = [],
): CompositionPlanDocument {
  const { calculation, targets, sources } = calculated;
  const { plan } = calculation;
  const foodName = (id: string) => sources.foods.get(id)?.name ?? '';
  return {
    modality: 'COMPOSITION',
    targets,
    dayProfiles: withPortions(profiles, calculation.profiles, (found) => ({
      totals: found.totals,
      adequacy: found.adequacy,
    })),
    nutrients: sources.nutrients,
    foods: usedFoods(
      sources,
      plan.meals.flatMap((meal) => meal.items.map((item) => item.foodId)),
    ),
    meals: plan.meals.map((meal, index) => ({
      ...header(meal),
      id: mealIds[index] ?? '',
      items: meal.items.map((item) => ({ ...item, foodName: foodName(item.foodId) })),
      totals: at(calculation.meals, index),
    })),
    totals: calculation.totals,
    adequacy: calculation.adequacy,
    methods: calculation.methods,
    hydrationTargetMl: plan.hydrationTargetMl,
    instructions: plan.instructions,
  };
}

/**
 * Un menú semanal; los id de sus celdas van día por día, de lunes a domingo, y en cada día en el orden de los tiempos
 * (vacíos en una vista previa).
 */
export function weeklyMenuDocument(
  calculated: CalculatedWeeklyMenu,
  cellIds: readonly string[],
  profiles: readonly DayProfileTargets[] = [],
): WeeklyMenuPlanDocument {
  const { calculation, targets, sources } = calculated;
  const { plan } = calculation;
  const named = (item: FoodItem | RecipeItem): DocumentMenuItem =>
    item.itemType === 'FOOD'
      ? { ...item, foodName: sources.foods.get(item.foodId)?.name ?? '' }
      : { ...item, recipeName: sources.recipes.get(item.recipeId)?.name ?? '' };
  const recipes = Object.fromEntries(
    [...calculation.recipes].map(([id, perServing]) => {
      const recipe = sources.recipes.get(id);
      return [
        id,
        {
          name: recipe?.name ?? '',
          servings: recipe?.servings ?? 0,
          ingredients: recipe?.ingredients ?? [],
          perServing,
        },
      ];
    }),
  );
  const items = plan.days.flatMap((day) =>
    day.meals.flatMap((cell) => [...cell.optionA, ...cell.optionB]),
  );
  return {
    modality: 'WEEKLY_MENU',
    targets,
    dayProfiles: withPortions(profiles, calculation.profiles, (found) => ({
      weeklyAverage: found.weeklyAverage,
      adequacy: found.adequacy,
    })),
    nutrients: sources.nutrients,
    foods: usedFoods(sources, [
      ...items.flatMap((item) => (item.itemType === 'FOOD' ? [item.foodId] : [])),
      ...Object.values(recipes).flatMap((r) => r.ingredients.map((i) => i.foodId)),
    ]),
    meals: plan.meals.map(header),
    days: plan.days.map((day, d) => {
      const totals = at(calculation.days, d);
      return {
        dayOfWeek: d + 1,
        meals: day.meals.map((cell, m) => ({
          id: cellIds[d * plan.meals.length + m] ?? '',
          optionA: cell.optionA.map(named),
          optionB: cell.optionB.map(named),
          totalsA: at(totals.cells, m).a,
          totalsB: at(totals.cells, m).b,
        })),
        totals: totals.totals,
      };
    }),
    weeklyAverage: calculation.weeklyAverage,
    recipes,
    adequacy: calculation.adequacy,
    methods: calculation.methods,
    hydrationTargetMl: plan.hydrationTargetMl,
    instructions: plan.instructions,
  };
}

/**
 * Versión del esquema del snapshot: la app y las fichas la leen antes de leer lo demás (05 §2). La 4 trae las porciones de
 * cada perfil (`portions` de cada perfil y `byProfile` de cada alimento o receta, P-20.5, ADR-102); en la 3, cada perfil
 * lleva las del plan. La 3 trae los perfiles de día (`dayProfiles`, P14.5, ADR-100). La 2 traía las metas de descanso en
 * kcal (ADR-099), que no llegaron a staging; un snapshot de la 1 o la 2 se lee con una sola meta.
 */
export const PLAN_SNAPSHOT_SCHEMA_VERSION = 4;

/** Quién publicó, cuándo y desde qué día vale. */
export interface PlanSnapshotMeta {
  readonly schemaVersion: 1 | 2 | 3 | typeof PLAN_SNAPSHOT_SCHEMA_VERSION;
  readonly planId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly patientId: string;
  readonly energyPrescriptionId: string;
  /** YYYY-MM-DD, fecha local del paciente. */
  readonly validFrom: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly engineVersion: string;
}

/**
 * Lo que congela publicar (RN-E15): el plan de su modalidad (modality distingue cada forma) con sus metas, sus
 * alimentos con sus nutrientes, la adecuación y cada método. La app del paciente y las fichas leen solo esto.
 */
export type PlanSnapshot = PlanSnapshotMeta & PlanDocument;

/** El snapshot y su hash: SHA-256 de su JSON canónico, para verificar que nada cambió (RN-H02). */
export function planSnapshot(
  document: PlanDocument,
  meta: Omit<PlanSnapshotMeta, 'schemaVersion' | 'engineVersion'>,
): { readonly snapshot: PlanSnapshot; readonly hash: string } {
  const snapshot: PlanSnapshot = {
    schemaVersion: PLAN_SNAPSHOT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    ...meta,
    ...document,
  };
  return { snapshot, hash: sha256Hex(canonicalJson(snapshot)) };
}
