import { ADEQUACY, RECIPE_NUTRIENTS, type RecipeOutput } from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import {
  compositionPlan,
  weeklyMenuPlan,
  type CompositionDraft,
  type MenuItem,
  type WeeklyMenuDraft,
} from '../domain/food-plan.js';
import { runPlanMethod, type PlanMethodRun, type PlanTargets } from './plan-calculation.js';

/** Un alimento como lo usa el cálculo: todos sus nutrientes por 100 g de parte comestible; null es «sin dato» (RN-I03). */
export interface PlanFoodData {
  readonly name: string;
  readonly state: 'RAW' | 'COOKED' | 'PROCESSED' | 'READY';
  readonly nutrientsPer100g: Readonly<Record<string, number | null>>;
}

/** Una receta con lo que rinde y sus ingredientes en gramos de parte comestible (RN-E12). */
export interface PlanRecipeData {
  readonly name: string;
  readonly servings: number;
  readonly ingredients: readonly { readonly foodId: string; readonly grams: number }[];
}

export interface PlanNutrient {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly core: boolean;
}

/** Los alimentos y recetas del plan, por su id, y el catálogo de nutrientes en el orden en que se muestra. */
export interface FoodPlanSources {
  readonly foods: ReadonlyMap<string, PlanFoodData>;
  readonly recipes: ReadonlyMap<string, PlanRecipeData>;
  readonly nutrients: readonly PlanNutrient[];
}

/** null es «sin dato» si a algún alimento le falta (RN-I03); known, lo que sí se conoce; missing, en cuántos falta. */
export interface NutrientTotal {
  readonly value: number | null;
  readonly known: number;
  readonly missing: number;
}

export interface ItemTotals {
  /** De cuántos alimentos sale: una receta cuenta sus ingredientes. */
  readonly ingredientCount: number;
  readonly nutrients: Readonly<Record<string, NutrientTotal>>;
}

/** Con lo conocido (ADR-062): missing de of dice cuánto falta para que sea exacta. */
export interface FoodAdequacy {
  readonly pct: number;
  readonly daysInRange: number;
  readonly days: number;
  readonly missing: number;
  readonly of: number;
}

export interface FoodAdequacyBlock {
  readonly rangePct: readonly [number, number];
  readonly kcal: FoodAdequacy;
  readonly cho: FoodAdequacy;
  readonly protein: FoodAdequacy;
  readonly fat: FoodAdequacy;
}

export interface CompositionCalculation {
  readonly plan: CompositionDraft;
  /** Uno por tiempo, en su orden. */
  readonly meals: readonly ItemTotals[];
  readonly totals: ItemTotals;
  readonly adequacy: FoodAdequacyBlock;
  readonly methods: readonly PlanMethodRun[];
}

export interface MenuCellTotals {
  readonly a: ItemTotals | null;
  readonly b: ItemTotals | null;
}

export interface WeeklyAverage {
  readonly value: number | null;
  readonly known: number;
  readonly missingDays: number;
}

export interface WeeklyMenuCalculation {
  readonly plan: WeeklyMenuDraft;
  /** De lunes a domingo: cada celda con lo de sus opciones y el día con la opción A de cada tiempo. */
  readonly days: readonly {
    readonly cells: readonly MenuCellTotals[];
    readonly totals: ItemTotals;
  }[];
  readonly weeklyAverage: Readonly<Record<string, WeeklyAverage>>;
  /** Lo de una porción de cada receta del menú (RN-E12). */
  readonly recipes: ReadonlyMap<string, ItemTotals>;
  readonly adequacy: FoodAdequacyBlock;
  readonly methods: readonly PlanMethodRun[];
}

/** El macronutriente de cada meta, por su código INFOODS. */
const MACROS = [
  ['kcal', 'kcal', 'ENERC_KCAL'],
  ['cho', 'choG', 'CHOCDF'],
  ['protein', 'proteinG', 'PROCNT'],
  ['fat', 'fatG', 'FAT'],
] as const;

/** Las sumas de un plan, cada una con su método; las de insumos iguales cuentan una vez (RN-D01). */
class Summer {
  readonly #methods = new Map<string, PlanMethodRun>();

  constructor(private readonly sources: FoodPlanSources) {}

  get methods(): readonly PlanMethodRun[] {
    return [...this.#methods.values()];
  }

  record(method: PlanMethodRun): void {
    this.#methods.set(`${method.methodCode}:${method.inputsHash}`, method);
  }

  /**
   * RN-E16 con RECIPE_NUTRIENTS, como una receta de una porción: Σ gramos × valor por 100 g ÷ 100. Una receta entra
   * como sus ingredientes, escalados a las porciones. Sin alimentos, todo es 0 y no se llama al motor.
   */
  totals(items: readonly MenuItem[]): ItemTotals {
    const ingredients = items.flatMap((item) => {
      if (item.itemType === 'FOOD') return [this.#ingredient(item.foodId, item.grams)];
      const recipe = this.sources.recipes.get(item.recipeId);
      if (!recipe) throw new Error(`Receta ${item.recipeId} sin cargar.`);
      return recipe.ingredients.map((i) =>
        this.#ingredient(i.foodId, (i.grams * item.servings) / recipe.servings),
      );
    });
    const codes = this.sources.nutrients.map((n) => n.code);
    if (ingredients.length === 0) {
      return {
        ingredientCount: 0,
        nutrients: Object.fromEntries(
          codes.map((code) => [code, { value: 0, known: 0, missing: 0 }]),
        ),
      };
    }
    const run = runPlanMethod<RecipeOutput>(RECIPE_NUTRIENTS, { ingredients, servings: 1 });
    // Con una porción y gramos positivos, RECIPE_NUTRIENTS no tiene ERROR: si lo da, es una falla técnica.
    if (!run.ok) throw new Error(`RECIPE_NUTRIENTS no calculó: ${run.error.code}`);
    this.record(run.method);
    const { totals, knownTotals, missingIngredients } = run.outputs;
    return {
      ingredientCount: ingredients.length,
      nutrients: Object.fromEntries(
        codes.map((code) => [
          code,
          {
            value: totals[code] ?? null,
            known: knownTotals[code] ?? 0,
            missing: missingIngredients[code] ?? 0,
          },
        ]),
      ),
    };
  }

  /**
   * RN-E10 con ADEQUACY frente a cada meta y el rango de la organización, con lo conocido de cada día (ADR-062): un dato
   * que falta no es cero (RN-I03), así que se cuenta aparte.
   */
  adequacy(
    targets: PlanTargets,
    days: readonly ItemTotals[],
    rangePct: readonly [number, number],
    missingOf: (code: string) => { readonly missing: number; readonly of: number },
  ): Result<FoodAdequacyBlock, DomainError> {
    const block: Record<string, FoodAdequacy> = {};
    for (const [key, target, code] of MACROS) {
      const result = runPlanMethod<{ adequacyPct: number; daysInRange: number }>(ADEQUACY, {
        prescribed: targets[target],
        consumedDaily: days.map((day) => day.nutrients[code]?.known ?? 0),
        acceptableRangePct: rangePct,
      });
      if (!result.ok) return err(result.error);
      this.record(result.method);
      block[key] = {
        pct: result.outputs.adequacyPct,
        daysInRange: result.outputs.daysInRange,
        days: days.length,
        ...missingOf(code),
      };
    }
    const { kcal, cho, protein, fat } = block as Record<(typeof MACROS)[number][0], FoodAdequacy>;
    return ok({ rangePct, kcal, cho, protein, fat });
  }

  #ingredient(foodId: string, grams: number) {
    const food = this.sources.foods.get(foodId);
    if (!food) throw new Error(`Alimento ${foodId} sin cargar.`);
    return {
      foodCode: foodId,
      grams,
      per100g: Object.fromEntries(
        this.sources.nutrients.map(({ code }) => [code, food.nutrientsPer100g[code] ?? null]),
      ),
    };
  }
}

/**
 * Una dieta por composición con el motor (RF-20, RN-E16): lo de cada tiempo y lo del día, con lo conocido aparte cuando
 * falta un dato (ADR-061), y la adecuación de kcal y macronutrientes del día (RN-E10). Las reglas del borrador las
 * decide el dominio; los alimentos llegan cargados.
 */
export function calculateComposition(
  draft: CompositionDraft,
  targets: PlanTargets,
  sources: FoodPlanSources,
  rangePct: readonly [number, number],
): Result<CompositionCalculation, DomainError> {
  const plan = compositionPlan(draft);
  if (!plan.ok) return plan;
  const summer = new Summer(sources);
  const meals = plan.value.meals.map((meal) => summer.totals(meal.items));
  const totals = summer.totals(plan.value.meals.flatMap((meal) => meal.items));
  const adequacy = summer.adequacy(targets, [totals], rangePct, (code) => ({
    missing: totals.nutrients[code]?.missing ?? 0,
    of: totals.ingredientCount,
  }));
  if (!adequacy.ok) return adequacy;
  return ok({
    plan: plan.value,
    meals,
    totals,
    adequacy: adequacy.value,
    methods: summer.methods,
  });
}

/**
 * Un menú semanal con el motor (RF-21, RN-E16): lo de cada opción de cada celda; el día con la opción A de cada tiempo;
 * el promedio de la semana, y la adecuación del promedio con los días en rango (RN-E10, RN-G09). Cada receta, además,
 * con lo de una porción (RN-E12).
 */
export function calculateWeeklyMenu(
  draft: WeeklyMenuDraft,
  targets: PlanTargets,
  sources: FoodPlanSources,
  rangePct: readonly [number, number],
): Result<WeeklyMenuCalculation, DomainError> {
  const plan = weeklyMenuPlan(draft);
  if (!plan.ok) return plan;
  const summer = new Summer(sources);
  const optional = (items: readonly MenuItem[]) =>
    items.length === 0 ? null : summer.totals(items);
  const days = plan.value.days.map((day) => ({
    cells: day.meals.map((cell) => ({ a: optional(cell.optionA), b: optional(cell.optionB) })),
    totals: summer.totals(day.meals.flatMap((cell) => cell.optionA)),
  }));

  const weeklyAverage = Object.fromEntries(
    sources.nutrients.map(({ code }) => {
      const values = days.map((day) => day.totals.nutrients[code]);
      const missingDays = values.filter((v) => v?.value === null).length;
      const mean = (pick: (v: NutrientTotal) => number) =>
        values.reduce((total, v) => total + (v ? pick(v) : 0), 0) / values.length;
      return [
        code,
        {
          value: missingDays > 0 ? null : mean((v) => v.value ?? 0),
          known: mean((v) => v.known),
          missingDays,
        },
      ];
    }),
  );

  const recipeIds = [
    ...new Set(
      plan.value.days.flatMap((day) =>
        day.meals.flatMap((cell) =>
          [...cell.optionA, ...cell.optionB].flatMap((item) =>
            item.itemType === 'RECIPE' ? [item.recipeId] : [],
          ),
        ),
      ),
    ),
  ];
  const recipes = new Map(
    recipeIds.map((recipeId) => [
      recipeId,
      summer.totals([{ itemType: 'RECIPE', recipeId, servings: 1 }]),
    ]),
  );

  const adequacy = summer.adequacy(
    targets,
    days.map((day) => day.totals),
    rangePct,
    (code) => ({
      missing: days.filter((day) => (day.totals.nutrients[code]?.missing ?? 0) > 0).length,
      of: days.length,
    }),
  );
  if (!adequacy.ok) return adequacy;
  return ok({
    plan: plan.value,
    days,
    weeklyAverage,
    recipes,
    adequacy: adequacy.value,
    methods: summer.methods,
  });
}
