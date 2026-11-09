/**
 * Lo que el paciente registra (02 §7, RN-G01 a RN-G12): la ventana de días, lo que aporta una comida del plan o del catálogo y el
 * total del día. Puro: el snapshot del plan llega como datos (RN-E15) y nada depende del reloj.
 */

/** Los nutrientes congelados al registrar: si el catálogo cambia, el día no cambia (05.2). null es «sin dato» (RN-I03). */
export interface LoggedNutrients {
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  /** Los micronutrientes conocidos por su código INFOODS; el que falta no va. */
  readonly micronutrients: Readonly<Record<string, number>>;
}

/** Un registro de comida listo para guardar (05.2, tracking.food_log). */
export interface FoodLogDraft {
  readonly mealSlotCode: string;
  readonly planMealId: string | null;
  readonly itemType: 'FOOD' | 'RECIPE' | 'EXCHANGE';
  readonly itemId: string;
  readonly itemName: string;
  readonly exchangeGroupCode: string | null;
  readonly servings: number | null;
  readonly grams: number | null;
  readonly householdText: string | null;
  readonly nutrients: LoggedNutrients;
  readonly inPlan: boolean;
}

/** Los códigos INFOODS de las columnas de food_log: los mismos que usa nutrition para las metas (CHOCDF, ADR-059). */
const CORE = { kcal: 'ENERC_KCAL', choG: 'CHOCDF', proteinG: 'PROCNT', fatG: 'FAT' } as const;
const CORE_CODES = new Set<string>(Object.values(CORE));

type NutrientValues = Readonly<Record<string, number | null>>;

interface ExchangeGroupValues {
  readonly code: string;
  readonly name: string;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly kcal: number;
}

interface FoodData {
  readonly name: string;
  readonly nutrientsPer100g: NutrientValues;
}

/**
 * byProfile: la cantidad en los perfiles de día que la cambian (07 §2, P-20.5); con 0, ese día no va. Falta en los snapshots
 * anteriores a la versión 4: la del plan vale todos los días.
 */
interface PlanFoodItem {
  readonly itemType: 'FOOD';
  readonly foodId: string;
  readonly foodName: string;
  readonly grams: number;
  readonly householdText: string | null;
  readonly byProfile?: Readonly<
    Record<string, { readonly grams: number; readonly householdText: string | null }>
  >;
}

interface PlanRecipeItem {
  readonly itemType: 'RECIPE';
  readonly recipeId: string;
  readonly recipeName: string;
  readonly servings: number;
  readonly byProfile?: Readonly<Record<string, { readonly servings: number }>>;
}

interface ExchangeMeal {
  readonly id: string;
  readonly slotCode: string;
  readonly name: string;
  readonly servings: Readonly<Record<string, number>>;
  readonly allowedFoods: readonly {
    readonly groupCode: string;
    readonly foodId: string;
    readonly foodName: string;
    readonly grams: number;
    readonly householdText: string | null;
  }[];
}

interface CompositionMeal {
  readonly id: string;
  readonly slotCode: string;
  readonly name: string;
  readonly items: readonly PlanFoodItem[];
}

interface MenuMeal {
  readonly slotCode: string;
  readonly name: string;
}

export interface PlanMacros {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

/**
 * Un perfil de día del plan con sus metas (07 §2). portions trae lo que el perfil cambia (P-20.5): en intercambios, los almidones
 * de cada tiempo (starchByMeal); falta en los snapshots anteriores a la versión 4.
 */
export interface PlanDayProfile extends PlanMacros {
  readonly code: string;
  readonly name: string;
  readonly portions?: object;
}

/**
 * Cada modalidad con sus tiempos; TMeal agrega a cada tiempo lo que la vista necesita (su horario). dayProfiles: los perfiles de
 * día (P-20); ausente en los snapshots anteriores a la versión 3: una sola meta.
 */
type PlanOf<TMeal> = { readonly dayProfiles?: readonly PlanDayProfile[] } & (
  | {
      readonly planId: string;
      readonly modality: 'EXCHANGES';
      readonly exchangeList: { readonly groups: readonly ExchangeGroupValues[] };
      readonly meals: readonly (ExchangeMeal & TMeal)[];
    }
  | {
      readonly planId: string;
      readonly modality: 'COMPOSITION';
      readonly foods: Readonly<Record<string, FoodData>>;
      readonly meals: readonly (CompositionMeal & TMeal)[];
    }
  | {
      readonly planId: string;
      readonly modality: 'WEEKLY_MENU';
      readonly foods: Readonly<Record<string, FoodData>>;
      readonly recipes: Readonly<
        Record<
          string,
          {
            readonly name: string;
            readonly perServing: {
              readonly nutrients: Readonly<Record<string, { readonly value: number | null }>>;
            };
          }
        >
      >;
      readonly meals: readonly (MenuMeal & TMeal)[];
      readonly days: readonly {
        readonly dayOfWeek: number;
        readonly meals: readonly {
          readonly id: string;
          readonly optionA: readonly (PlanFoodItem | PlanRecipeItem)[];
          readonly optionB: readonly (PlanFoodItem | PlanRecipeItem)[];
        }[];
      }[];
    }
);

/**
 * Lo que el registro toma del snapshot del plan publicado, por modalidad: estructural, como PlanTargets. El snapshot de
 * nutrition lo cumple y tracking no importa sus tipos internos (02 §4).
 */
export type LoggablePlan = PlanOf<unknown>;

/**
 * Qué eligió el paciente de su plan (RN-G05). En intercambios, un alimento permitido de un grupo y un tiempo; en composición, un
 * alimento del tiempo; en el menú, la opción A o B de la celda del día. null en porciones o gramos: la del plan.
 */
export type PlanPick =
  | {
      readonly kind: 'EXCHANGE';
      readonly mealId: string;
      readonly groupCode: string;
      readonly foodId: string;
      readonly servings: number | null;
    }
  | {
      readonly kind: 'FOOD';
      readonly mealId: string;
      readonly foodId: string;
      readonly grams: number | null;
    }
  | { readonly kind: 'MENU'; readonly mealId: string; readonly option: 'A' | 'B' };

/** El perfil de día con cuyas porciones se muestra y se registra el plan (07 §2, P-20.5). */
export interface DayPortions {
  readonly code: string;
  readonly name: string;
  /** Intercambios: los almidones de cada tiempo, en su orden; null, los del plan. */
  readonly starchByMeal: readonly number[] | null;
}

/** Los almidones de un perfil en intercambios, si el snapshot los trae como se espera (versión 4). */
function starchOf(portions: object | undefined): readonly number[] | null {
  if (!portions || !('starchByMeal' in portions)) return null;
  const { starchByMeal } = portions;
  return Array.isArray(starchByMeal) &&
    starchByMeal.every((n: unknown): n is number => typeof n === 'number')
    ? starchByMeal
    : null;
}

/**
 * Las porciones del perfil de ese día (el de su meta, RN-G03). Sin código, con Entrenamiento o con un perfil que el plan ya no
 * tiene: null, las del plan.
 */
export function dayPortionsOf(plan: LoggablePlan, profileCode: string | null): DayPortions | null {
  const profile = profileCode ? plan.dayProfiles?.find((p) => p.code === profileCode) : undefined;
  return profile
    ? { code: profile.code, name: profile.name, starchByMeal: starchOf(profile.portions) }
    : null;
}

/** Las porciones de un tiempo por intercambios en ese perfil: las del plan con los almidones del perfil (P-20.5). */
function servingsIn(
  meal: ExchangeMeal,
  index: number,
  portions: DayPortions | null,
): Readonly<Record<string, number>> {
  const starch = portions?.starchByMeal?.[index];
  return starch === undefined ? meal.servings : { ...meal.servings, STA: starch };
}

/** Cada alimento o receta con su cantidad en ese perfil, sin los que ese día no van (P-20.5). */
function itemsIn<T extends PlanFoodItem | PlanRecipeItem>(
  items: readonly T[],
  portions: DayPortions | null,
): T[] {
  if (!portions) return [...items];
  return items.flatMap((item): T[] => {
    if (item.itemType === 'FOOD') {
      const portion = item.byProfile?.[portions.code];
      if (!portion) return [item];
      return portion.grams > 0
        ? [{ ...item, grams: portion.grams, householdText: portion.householdText }]
        : [];
    }
    const portion = item.byProfile?.[portions.code];
    if (!portion) return [item];
    return portion.servings > 0 ? [{ ...item, servings: portion.servings }] : [];
  });
}

/** Hoy y hasta N días atrás; una fecha futura no se acepta (RN-G10). Las fechas son YYYY-MM-DD locales del paciente (RN-G04). */
export type WindowVerdict = 'OPEN' | 'FUTURE' | 'CLOSED';

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

export function recordWindow(localDate: string, today: string, windowDays: number): WindowVerdict {
  const daysBack = dayNumber(today) - dayNumber(localDate);
  if (daysBack < 0) return 'FUTURE';
  return daysBack <= windowDays ? 'OPEN' : 'CLOSED';
}

/** Lo que aportan unos gramos de un alimento: por 100 g de parte comestible (RN-E12); lo que falta, sin dato (RN-I03). */
function perGrams(per100g: NutrientValues, grams: number): LoggedNutrients {
  const scale = (value: number | null | undefined) =>
    value === null || value === undefined ? null : (value * grams) / 100;
  const micronutrients = Object.fromEntries(
    Object.entries(per100g).flatMap(([code, value]) =>
      CORE_CODES.has(code) || value === null ? [] : [[code, (value * grams) / 100]],
    ),
  );
  return {
    kcal: scale(per100g[CORE.kcal]),
    choG: scale(per100g[CORE.choG]),
    proteinG: scale(per100g[CORE.proteinG]),
    fatG: scale(per100g[CORE.fatG]),
    micronutrients,
  };
}

/** Lo que aportan unas porciones de una receta: lo de una porción × porciones (RN-E12, RN-E16). */
function perServings(
  perServing: Readonly<Record<string, { readonly value: number | null }>>,
  servings: number,
): LoggedNutrients {
  const values: Record<string, number | null> = {};
  for (const [code, total] of Object.entries(perServing)) values[code] = total.value;
  // Una porción equivale a 100 «gramos» de la escala de perGrams: así se reutiliza la misma regla de lo que falta.
  return perGrams(values, servings * 100);
}

function foodDraft(
  meal: { readonly id: string; readonly slotCode: string },
  item: PlanFoodItem,
  food: FoodData | undefined,
  grams: number,
): FoodLogDraft | null {
  if (!food) return null;
  return {
    mealSlotCode: meal.slotCode,
    planMealId: meal.id,
    itemType: 'FOOD',
    itemId: item.foodId,
    itemName: item.foodName,
    exchangeGroupCode: null,
    servings: null,
    grams,
    householdText: grams === item.grams ? item.householdText : null,
    nutrients: perGrams(food.nutrientsPer100g, grams),
    inPlan: true,
  };
}

/**
 * Los registros de lo que el paciente eligió de su plan (RN-G05), con los nutrientes congelados. En intercambios, cada porción
 * suma los valores de su grupo (guía de dominio §7.1). Lo del plan es lo del perfil de ese día (P-20.5): lo que ese día no va
 * no está en el plan. null si lo elegido no está en el plan.
 */
export function planDrafts(
  plan: LoggablePlan,
  pick: PlanPick,
  portions: DayPortions | null = null,
): readonly FoodLogDraft[] | null {
  if (plan.modality === 'EXCHANGES' && pick.kind === 'EXCHANGE') {
    const index = plan.meals.findIndex((m) => m.id === pick.mealId);
    const meal = plan.meals[index];
    const food = meal?.allowedFoods.find(
      (f) => f.foodId === pick.foodId && f.groupCode === pick.groupCode,
    );
    const group = plan.exchangeList.groups.find((g) => g.code === pick.groupCode);
    const planned = meal ? (servingsIn(meal, index, portions)[pick.groupCode] ?? 0) : 0;
    const servings = pick.servings ?? planned;
    if (!meal || !food || !group || servings <= 0) return null;
    return [
      {
        mealSlotCode: meal.slotCode,
        planMealId: meal.id,
        itemType: 'EXCHANGE',
        itemId: food.foodId,
        itemName: food.foodName,
        exchangeGroupCode: group.code,
        servings,
        grams: food.grams * servings,
        householdText: food.householdText,
        nutrients: {
          kcal: group.kcal * servings,
          choG: group.choG * servings,
          proteinG: group.proteinG * servings,
          fatG: group.fatG * servings,
          micronutrients: {},
        },
        inPlan: true,
      },
    ];
  }
  if (plan.modality === 'COMPOSITION' && pick.kind === 'FOOD') {
    const meal = plan.meals.find((m) => m.id === pick.mealId);
    const item = meal && itemsIn(meal.items, portions).find((i) => i.foodId === pick.foodId);
    if (!meal || !item) return null;
    const draft = foodDraft(meal, item, plan.foods[item.foodId], pick.grams ?? item.grams);
    return draft ? [draft] : null;
  }
  if (plan.modality === 'WEEKLY_MENU' && pick.kind === 'MENU') {
    for (const day of plan.days) {
      const index = day.meals.findIndex((cell) => cell.id === pick.mealId);
      const cell = day.meals[index];
      const header = plan.meals[index];
      if (!cell || !header) continue;
      const items = itemsIn(pick.option === 'A' ? cell.optionA : cell.optionB, portions);
      const meal = { id: cell.id, slotCode: header.slotCode };
      const drafts = items.map((item): FoodLogDraft | null => {
        if (item.itemType === 'FOOD') {
          return foodDraft(meal, item, plan.foods[item.foodId], item.grams);
        }
        const recipe = plan.recipes[item.recipeId];
        if (!recipe) return null;
        return {
          mealSlotCode: header.slotCode,
          planMealId: cell.id,
          itemType: 'RECIPE',
          itemId: item.recipeId,
          itemName: item.recipeName,
          exchangeGroupCode: null,
          servings: item.servings,
          grams: null,
          householdText: null,
          nutrients: perServings(recipe.perServing.nutrients, item.servings),
          inPlan: true,
        };
      });
      if (drafts.length === 0 || drafts.some((draft) => draft === null)) return null;
      return drafts as FoodLogDraft[];
    }
    return null;
  }
  return null;
}

/** Lo que la app muestra de un plan, además de lo que el registro usa: versión, vigencia, agua, indicaciones y horarios. */
export type AppPlan = {
  readonly versionNo: number;
  readonly validFrom: string;
  /** Las de la prescripción: las de Entrenamiento (07 §2). */
  readonly targets: PlanMacros;
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
} & PlanOf<{ readonly timeOfDay: string | null }>;

export interface PlanViewMenuItem {
  readonly name: string;
  readonly grams: number | null;
  readonly servings: number | null;
  readonly householdText: string | null;
}

export type PlanViewOption =
  | {
      readonly kind: 'EXCHANGE';
      readonly groupCode: string;
      readonly groupName: string;
      readonly servings: number;
      readonly foods: readonly {
        readonly foodId: string;
        readonly foodName: string;
        readonly gramsPerServing: number;
        readonly householdText: string | null;
      }[];
    }
  | {
      readonly kind: 'FOOD';
      readonly foodId: string;
      readonly foodName: string;
      readonly grams: number;
      readonly householdText: string | null;
    }
  | {
      readonly kind: 'MENU';
      readonly option: 'A' | 'B';
      readonly items: readonly PlanViewMenuItem[];
    };

export interface PlanViewMeal {
  readonly id: string;
  readonly slotCode: string;
  readonly name: string;
  readonly timeOfDay: string | null;
  readonly options: readonly PlanViewOption[];
}

export interface PlanView {
  readonly planId: string;
  readonly versionNo: number;
  readonly modality: LoggablePlan['modality'];
  readonly validFrom: string;
  readonly targets: PlanMacros;
  readonly dayProfiles: readonly (PlanMacros & { readonly code: string; readonly name: string })[];
  /** El perfil de ese día, cuyas porciones son las de meals (P-20.5); null, las del plan. */
  readonly profile: { readonly code: string; readonly name: string } | null;
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
  readonly meals: readonly PlanViewMeal[];
}

/** De lunes (1) a domingo (7), como los días del menú semanal. */
const isoWeekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

const menuItem = (item: PlanFoodItem | PlanRecipeItem): PlanViewMenuItem =>
  item.itemType === 'FOOD'
    ? { name: item.foodName, grams: item.grams, servings: null, householdText: item.householdText }
    : { name: item.recipeName, grams: null, servings: item.servings, householdText: null };

const macrosOf = ({ kcal, choG, proteinG, fatG }: PlanMacros): PlanMacros => ({
  kcal,
  choG,
  proteinG,
  fatG,
});

/**
 * El plan por tiempos de comida, listo para registrar desde él (RF-28, RN-G06): en intercambios, cada grupo del tiempo con sus
 * porciones y sus alimentos permitidos; en composición, cada alimento; en el menú, las opciones del día de la semana pedido.
 * Con las porciones del perfil de ese día (P-20.5): lo que ese día no va, no aparece.
 */
export function planView(
  plan: AppPlan,
  localDate: string,
  portions: DayPortions | null = null,
): PlanView {
  const base = {
    planId: plan.planId,
    versionNo: plan.versionNo,
    modality: plan.modality,
    validFrom: plan.validFrom,
    targets: macrosOf(plan.targets),
    dayProfiles: (plan.dayProfiles ?? []).map((profile) => ({
      code: profile.code,
      name: profile.name,
      ...macrosOf(profile),
    })),
    profile: portions && { code: portions.code, name: portions.name },
    hydrationTargetMl: plan.hydrationTargetMl,
    instructions: plan.instructions,
  };
  if (plan.modality === 'EXCHANGES') {
    return {
      ...base,
      meals: plan.meals.map((meal, index) => ({
        id: meal.id,
        slotCode: meal.slotCode,
        name: meal.name,
        timeOfDay: meal.timeOfDay,
        options: plan.exchangeList.groups.flatMap((group): PlanViewOption[] => {
          const servings = servingsIn(meal, index, portions)[group.code] ?? 0;
          const foods = meal.allowedFoods.filter((food) => food.groupCode === group.code);
          if (servings <= 0 || foods.length === 0) return [];
          return [
            {
              kind: 'EXCHANGE',
              groupCode: group.code,
              groupName: group.name,
              servings,
              foods: foods.map((food) => ({
                foodId: food.foodId,
                foodName: food.foodName,
                gramsPerServing: food.grams,
                householdText: food.householdText,
              })),
            },
          ];
        }),
      })),
    };
  }
  if (plan.modality === 'COMPOSITION') {
    return {
      ...base,
      meals: plan.meals.map((meal) => ({
        id: meal.id,
        slotCode: meal.slotCode,
        name: meal.name,
        timeOfDay: meal.timeOfDay,
        options: itemsIn(meal.items, portions).map((item) => ({
          kind: 'FOOD' as const,
          foodId: item.foodId,
          foodName: item.foodName,
          grams: item.grams,
          householdText: item.householdText,
        })),
      })),
    };
  }
  const day = plan.days.find((d) => d.dayOfWeek === isoWeekday(localDate));
  return {
    ...base,
    meals: (day?.meals ?? []).flatMap((cell, index) => {
      const header = plan.meals[index];
      if (!header) return [];
      const options: PlanViewOption[] = [];
      const optionA = itemsIn(cell.optionA, portions);
      const optionB = itemsIn(cell.optionB, portions);
      if (optionA.length > 0) {
        options.push({ kind: 'MENU', option: 'A', items: optionA.map(menuItem) });
      }
      if (optionB.length > 0) {
        options.push({ kind: 'MENU', option: 'B', items: optionB.map(menuItem) });
      }
      return [
        {
          id: cell.id,
          slotCode: header.slotCode,
          name: header.name,
          timeOfDay: header.timeOfDay,
          options,
        },
      ];
    }),
  };
}

/** Algo fuera del plan, desde el catálogo (RN-G05): queda marcado y lleva los nutrientes del alimento por sus gramos. */
export function catalogFoodDraft(
  food: { readonly id: string; readonly name: string; readonly nutrientsPer100g: NutrientValues },
  choice: { readonly mealSlotCode: string; readonly grams: number },
): FoodLogDraft {
  return {
    mealSlotCode: choice.mealSlotCode,
    planMealId: null,
    itemType: 'FOOD',
    itemId: food.id,
    itemName: food.name,
    exchangeGroupCode: null,
    servings: null,
    grams: choice.grams,
    householdText: null,
    nutrients: perGrams(food.nutrientsPer100g, choice.grams),
    inPlan: false,
  };
}

/** Un total con lo que falta a la vista (RN-I03): sin dato si falta en algún registro, con lo conocido aparte. */
export interface DayTotal {
  readonly value: number | null;
  readonly known: number;
  readonly missing: number;
}

export interface DayTotals {
  readonly kcal: DayTotal;
  readonly choG: DayTotal;
  readonly proteinG: DayTotal;
  readonly fatG: DayTotal;
}

type CoreValues = Pick<LoggedNutrients, 'kcal' | 'choG' | 'proteinG' | 'fatG'>;

/** El total del día de los registros vigentes (RN-G09): suma lo conocido y cuenta en cuántos falta cada nutriente. */
export function dayTotals(logs: readonly CoreValues[]): DayTotals {
  const total = (key: keyof CoreValues): DayTotal => {
    let known = 0;
    let missing = 0;
    for (const log of logs) {
      const value = log[key];
      if (value === null) missing += 1;
      else known += value;
    }
    return { value: missing > 0 ? null : known, known, missing };
  };
  return {
    kcal: total('kcal'),
    choG: total('choG'),
    proteinG: total('proteinG'),
    fatG: total('fatG'),
  };
}
