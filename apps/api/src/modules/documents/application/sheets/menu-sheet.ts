import type {
  CompositionPlanDocument,
  EnergySummary,
  PlanSnapshot,
  WeeklyMenuPlanDocument,
} from '../../../nutrition/index.js';
import {
  dayProfilesOf,
  uniqueMethods,
  type SheetDayProfile,
  type SheetMethod,
  type SheetPatient,
} from './sheet-content.js';

/** Energía, macronutrientes y fibra: los que la ficha muestra de cada día (RN-E16). */
export const SHEET_NUTRIENTS = {
  kcal: 'ENERC_KCAL',
  cho: 'CHOCDF',
  protein: 'PROCNT',
  fat: 'FAT',
  fiber: 'FIBTG',
} as const;

/** Un total con lo conocido (RN-I03, ADR-061): null es «sin dato»; known, la suma de lo que se conoce; missing, en cuántos falta. */
export interface SheetTotal {
  readonly value: number | null;
  readonly known: number;
  readonly missing: number;
}

export type SheetTotals = Readonly<Record<keyof typeof SHEET_NUTRIENTS, SheetTotal>> & {
  /** De cuántos alimentos sale (o en cuántos días, en el promedio): el «de M» de «falta en N de M». */
  readonly of: number;
};

/**
 * Lo que come el paciente en un tiempo: un alimento con sus gramos y medida casera, o una receta en porciones. byProfile: su
 * cantidad en los perfiles de día que la cambian (P-20.5; plantilla 1.2.0); solo si hay alguno, para que lo de antes quede igual.
 */
export type SheetMenuItem =
  | {
      readonly kind: 'FOOD';
      readonly name: string;
      readonly grams: number;
      readonly householdText: string | null;
      readonly byProfile?: Readonly<
        Record<string, { readonly grams: number; readonly householdText: string | null }>
      >;
    }
  | {
      readonly kind: 'RECIPE';
      readonly name: string;
      readonly servings: number;
      readonly byProfile?: Readonly<Record<string, { readonly servings: number }>>;
    };

/** Las cantidades por perfil de un alimento o receta del snapshot, solo si hay alguna. */
function withPortions<T extends object>(
  byProfile: Readonly<Record<string, T>> | undefined,
): { readonly byProfile?: Readonly<Record<string, T>> } {
  return byProfile && Object.keys(byProfile).length > 0 ? { byProfile } : {};
}

export interface SheetFoodAdequacy {
  readonly pct: number;
  readonly daysInRange: number;
  readonly days: number;
  readonly missing: number;
  readonly of: number;
}

/**
 * Ficha del menú (RF-21) y, con la misma plantilla, de la dieta por composición como un plan de un día (RF-20, ADR-064):
 * los tiempos de comida y, en cada día, lo de cada tiempo con su opción A y B, el total del día con la opción A, el
 * promedio de la semana y cada receta con sus ingredientes y lo de una porción (RN-E12, RN-E16).
 */
export interface MenuSheet {
  readonly kind: 'WEEKLY_MENU';
  readonly modality: 'COMPOSITION' | 'WEEKLY_MENU';
  readonly patient: SheetPatient;
  readonly plan: {
    readonly versionNo: number;
    readonly validFrom: string;
    readonly publishedAt: string;
    readonly engineVersion: string;
  };
  readonly energy: EnergySummary | null;
  readonly targets: {
    readonly kcal: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
  };
  /** Los demás perfiles de día con sus metas (07 §2, P-20); vacío, una sola meta. Los dibuja la plantilla 1.1.0. */
  readonly dayProfiles: readonly SheetDayProfile[];
  readonly meals: readonly {
    readonly name: string;
    readonly timeOfDay: string | null;
    readonly sharePct: number;
  }[];
  /** De lunes (1) a domingo (7); la composición es un solo día, sin día de la semana. */
  readonly days: readonly {
    readonly dayOfWeek: number | null;
    /** Uno por tiempo de comida, en su orden; la composición solo tiene opción A. */
    readonly cells: readonly {
      readonly optionA: readonly SheetMenuItem[];
      readonly optionB: readonly SheetMenuItem[];
    }[];
    readonly totals: SheetTotals;
  }[];
  /** Promedio de los siete días; null en la composición. */
  readonly average: SheetTotals | null;
  readonly adequacy: {
    readonly rangePct: readonly [number, number];
    readonly kcal: SheetFoodAdequacy;
    readonly cho: SheetFoodAdequacy;
    readonly protein: SheetFoodAdequacy;
    readonly fat: SheetFoodAdequacy;
  };
  readonly recipes: readonly {
    readonly name: string;
    readonly servings: number;
    readonly ingredients: readonly { readonly name: string; readonly grams: number }[];
    readonly perServing: SheetTotals;
  }[];
  readonly hydrationMl: number | null;
  readonly instructions: string | null;
  readonly methods: readonly SheetMethod[];
}

type FoodPlanSnapshot = PlanSnapshot & (CompositionPlanDocument | WeeklyMenuPlanDocument);
type ItemTotals = CompositionPlanDocument['totals'];

function totalsOf(totals: ItemTotals): SheetTotals {
  const total = (code: string): SheetTotal => {
    const nutrient = totals.nutrients[code];
    return nutrient
      ? { value: nutrient.value, known: nutrient.known, missing: nutrient.missing }
      : { value: null, known: 0, missing: totals.ingredientCount };
  };
  return {
    kcal: total(SHEET_NUTRIENTS.kcal),
    cho: total(SHEET_NUTRIENTS.cho),
    protein: total(SHEET_NUTRIENTS.protein),
    fat: total(SHEET_NUTRIENTS.fat),
    fiber: total(SHEET_NUTRIENTS.fiber),
    of: totals.ingredientCount,
  };
}

function averageOf(menu: WeeklyMenuPlanDocument): SheetTotals {
  const total = (code: string): SheetTotal => {
    const average = menu.weeklyAverage[code];
    return average
      ? { value: average.value, known: average.known, missing: average.missingDays }
      : { value: null, known: 0, missing: menu.days.length };
  };
  return {
    kcal: total(SHEET_NUTRIENTS.kcal),
    cho: total(SHEET_NUTRIENTS.cho),
    protein: total(SHEET_NUTRIENTS.protein),
    fat: total(SHEET_NUTRIENTS.fat),
    fiber: total(SHEET_NUTRIENTS.fiber),
    of: menu.days.length,
  };
}

/** La ficha de un menú semanal o de una dieta por composición publicados, desde su snapshot (RN-E15). */
export function menuSheet(
  snapshot: FoodPlanSnapshot,
  patient: SheetPatient,
  energy: EnergySummary | null,
): MenuSheet {
  const foodName = (id: string) => snapshot.foods[id]?.name ?? '';
  const common = {
    kind: 'WEEKLY_MENU' as const,
    modality: snapshot.modality,
    patient,
    plan: {
      versionNo: snapshot.versionNo,
      validFrom: snapshot.validFrom,
      publishedAt: snapshot.publishedAt,
      engineVersion: snapshot.engineVersion,
    },
    energy,
    targets: snapshot.targets,
    dayProfiles: dayProfilesOf(snapshot.dayProfiles),
    meals: snapshot.meals.map(({ name, timeOfDay, sharePct }) => ({ name, timeOfDay, sharePct })),
    adequacy: snapshot.adequacy,
    hydrationMl: snapshot.hydrationTargetMl,
    instructions: snapshot.instructions,
    methods: uniqueMethods(snapshot.methods),
  };
  if (snapshot.modality === 'COMPOSITION') {
    return {
      ...common,
      days: [
        {
          dayOfWeek: null,
          cells: snapshot.meals.map((meal) => ({
            optionA: meal.items.map((item): SheetMenuItem => ({
              kind: 'FOOD',
              name: item.foodName,
              grams: item.grams,
              householdText: item.householdText,
              ...withPortions(item.byProfile),
            })),
            optionB: [],
          })),
          totals: totalsOf(snapshot.totals),
        },
      ],
      average: null,
      recipes: [],
    };
  }
  const item = (
    entry: WeeklyMenuPlanDocument['days'][number]['meals'][number]['optionA'][number],
  ): SheetMenuItem =>
    entry.itemType === 'FOOD'
      ? {
          kind: 'FOOD',
          name: entry.foodName,
          grams: entry.grams,
          householdText: entry.householdText,
          ...withPortions(entry.byProfile),
        }
      : {
          kind: 'RECIPE',
          name: entry.recipeName,
          servings: entry.servings,
          ...withPortions(entry.byProfile),
        };
  return {
    ...common,
    days: snapshot.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      cells: day.meals.map((cell) => ({
        optionA: cell.optionA.map(item),
        optionB: cell.optionB.map(item),
      })),
      totals: totalsOf(day.totals),
    })),
    average: averageOf(snapshot),
    recipes: Object.values(snapshot.recipes)
      .map((recipe) => ({
        name: recipe.name,
        servings: recipe.servings,
        ingredients: recipe.ingredients.map((i) => ({ name: foodName(i.foodId), grams: i.grams })),
        perServing: totalsOf(recipe.perServing),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}
