import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import {
  DEFAULT_MEALS,
  invalidPlan,
  type MealSlotCode,
  type PlanDraftInput,
} from './nutrition-plan.js';

/** Un alimento con sus gramos de parte comestible en el estado indicado (RN-E12) y, si se quiere, su medida casera. */
export interface FoodItem {
  readonly itemType: 'FOOD';
  readonly foodId: string;
  readonly grams: number;
  readonly householdText: string | null;
}

/** Una receta del recetario de la organización, en porciones (RN-E16). */
export interface RecipeItem {
  readonly itemType: 'RECIPE';
  readonly recipeId: string;
  readonly servings: number;
}

export type MenuItem = FoodItem | RecipeItem;

/** Un tiempo de comida; en el menú, el mismo los siete días. */
export interface MealHeader {
  readonly slotCode: MealSlotCode;
  readonly name: string;
  /** HH:MM, hora local del paciente. */
  readonly timeOfDay: string | null;
  /** La parte de la meta del día; los tiempos suman 100 (RN-E09). */
  readonly sharePct: number;
}

export interface CompositionMeal extends MealHeader {
  readonly items: readonly FoodItem[];
}

/** Dieta por composición (RF-20): alimentos con sus gramos en cada tiempo de comida. */
export interface CompositionDraft {
  readonly meals: readonly CompositionMeal[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/** Un tiempo en un día del menú: la opción A y, si se quiere, una B para cambiarla. */
export interface MenuCell {
  readonly optionA: readonly MenuItem[];
  readonly optionB: readonly MenuItem[];
}

export interface MenuDay {
  /** Una celda por tiempo de comida, en su orden. */
  readonly meals: readonly MenuCell[];
}

/** Menú semanal (RF-21): de lunes a domingo, los mismos tiempos con alimentos o recetas. */
export interface WeeklyMenuDraft {
  readonly meals: readonly MealHeader[];
  /** Siete, de lunes a domingo. */
  readonly days: readonly MenuDay[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/** El borrador de cualquier modalidad, tal como lo escribe el profesional. */
export type PlanDraft =
  | ({ readonly modality: 'EXCHANGES' } & PlanDraftInput)
  | ({ readonly modality: 'COMPOSITION' } & CompositionDraft)
  | ({ readonly modality: 'WEEKLY_MENU' } & WeeklyMenuDraft);

/** De lunes (1 en la base) a domingo (7). */
export const DAYS_OF_WEEK = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const;

/** Los tiempos con que empieza un plan: los de G-19, sin alimentos. */
export const DEFAULT_MEAL_HEADERS: readonly MealHeader[] = DEFAULT_MEALS.map(
  ({ slotCode, name, timeOfDay, sharePct }) => ({ slotCode, name, timeOfDay, sharePct }),
);

/** Siete días con una celda vacía por tiempo. */
export function emptyMenuDays(mealCount: number): readonly MenuDay[] {
  return DAYS_OF_WEEK.map(() => ({
    meals: Array.from({ length: mealCount }, () => ({ optionA: [], optionB: [] })),
  }));
}

/** Gramos y porciones con los dos decimales que guarda la base: lo calculado es lo guardado. */
const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** «el martes y el jueves», «el lunes, el martes y el jueves». */
function daysList(days: readonly string[]): string {
  const named = days.map((day) => `el ${day}`);
  const last = named.pop();
  return named.length === 0 ? (last ?? '') : `${named.join(', ')} y ${last ?? ''}`;
}

function sharesProblem(meals: readonly MealHeader[]): string | null {
  const total = meals.reduce((sum, meal) => sum + Math.round(meal.sharePct * 100), 0);
  return total === 10_000
    ? null
    : `Los porcentajes de los tiempos de comida suman ${String(total / 100)}: deben sumar 100 (RN-E09).`;
}

const header = (meal: MealHeader): MealHeader => ({
  slotCode: meal.slotCode,
  name: meal.name,
  timeOfDay: meal.timeOfDay,
  sharePct: cents(meal.sharePct),
});

function normalizedItem(item: MenuItem): MenuItem {
  return item.itemType === 'FOOD'
    ? { ...item, grams: cents(item.grams) }
    : { ...item, servings: cents(item.servings) };
}

/** Lo que no cuadra en una lista de alimentos o recetas, con dónde está. */
function itemProblems(where: string, items: readonly MenuItem[]): readonly string[] {
  const problems: string[] = [];
  if (items.some((item) => item.itemType === 'FOOD' && item.grams <= 0)) {
    problems.push(`${where}: cada alimento pesa más de 0 g (RN-E12).`);
  }
  if (items.some((item) => item.itemType === 'RECIPE' && item.servings <= 0)) {
    problems.push(`${where}: cada receta va en más de 0 porciones (RN-E16).`);
  }
  return problems;
}

/**
 * Una dieta por composición (RF-20, RN-E16): tiempos cuyos porcentajes suman 100 (RN-E09) y alimentos con más de 0 g
 * de parte comestible (RN-E12), con los decimales que guarda la base. Un tiempo sin alimentos se guarda; para publicar
 * debe tener alguno.
 */
export function compositionPlan(draft: CompositionDraft): Result<CompositionDraft, DomainError> {
  const share = sharesProblem(draft.meals);
  if (share) return err(invalidPlan([share]));
  const meals = draft.meals.map((meal) => ({
    ...header(meal),
    items: meal.items.map((item) => ({ ...item, grams: cents(item.grams) })),
  }));
  const problems = meals.flatMap((meal) => itemProblems(meal.name, meal.items));
  if (problems.length > 0) return err(invalidPlan(problems));
  return ok({
    meals,
    hydrationTargetMl: draft.hydrationTargetMl,
    instructions: draft.instructions,
  });
}

/**
 * Un menú semanal (RF-21, RN-E16): siete días con una celda por tiempo, tiempos cuyos porcentajes suman 100 (RN-E09),
 * alimentos con más de 0 g (RN-E12) y recetas con más de 0 porciones, con los decimales que guarda la base.
 */
export function weeklyMenuPlan(draft: WeeklyMenuDraft): Result<WeeklyMenuDraft, DomainError> {
  const share = sharesProblem(draft.meals);
  if (share) return err(invalidPlan([share]));
  if (draft.days.length !== DAYS_OF_WEEK.length) {
    return err(
      invalidPlan([
        `El menú tiene ${String(draft.days.length)} días: deben ser 7, de lunes a domingo (RN-E16).`,
      ]),
    );
  }
  const problems: string[] = [];
  const days = draft.days.map((day, d): MenuDay => {
    const dayName = capitalized(DAYS_OF_WEEK[d] ?? '');
    if (day.meals.length !== draft.meals.length) {
      problems.push(
        `${dayName}: tiene ${String(day.meals.length)} tiempos de comida y el menú tiene ${String(draft.meals.length)} (RN-E16).`,
      );
    }
    return {
      meals: day.meals.map((cell, m) => {
        const optionA = cell.optionA.map(normalizedItem);
        const optionB = cell.optionB.map(normalizedItem);
        problems.push(
          ...itemProblems(`${dayName} · ${draft.meals[m]?.name ?? ''}`, [...optionA, ...optionB]),
        );
        return { optionA, optionB };
      }),
    };
  });
  if (problems.length > 0) return err(invalidPlan(problems));
  return ok({
    meals: draft.meals.map(header),
    days,
    hydrationTargetMl: draft.hydrationTargetMl,
    instructions: draft.instructions,
  });
}

/**
 * Lo que falta para publicar una composición (RN-E13, RN-G05): la meta de hidratación y al menos un alimento en cada
 * tiempo, para que el paciente registre desde su plan.
 */
export function compositionPublishProblems(plan: CompositionDraft): readonly string[] {
  const problems: string[] = [];
  if (plan.hydrationTargetMl === null) problems.push('Falta la meta de hidratación (RN-E13).');
  for (const meal of plan.meals) {
    if (meal.items.length === 0)
      problems.push(`${meal.name}: agrega al menos un alimento (RN-G05).`);
  }
  return problems;
}

/**
 * Lo que falta para publicar un menú (RN-E13, RN-G05): la meta de hidratación y la opción A de cada tiempo los siete
 * días. La opción B es opcional.
 */
export function weeklyMenuPublishProblems(plan: WeeklyMenuDraft): readonly string[] {
  const problems: string[] = [];
  if (plan.hydrationTargetMl === null) problems.push('Falta la meta de hidratación (RN-E13).');
  plan.meals.forEach((meal, m) => {
    const missing = DAYS_OF_WEEK.filter(
      (_, d) => (plan.days[d]?.meals[m]?.optionA.length ?? 0) === 0,
    );
    if (missing.length === DAYS_OF_WEEK.length) {
      problems.push(`${meal.name}: falta la opción A todos los días (RN-G05).`);
    } else if (missing.length > 0) {
      problems.push(`${meal.name}: falta la opción A ${daysList(missing)} (RN-G05).`);
    }
  });
  return problems;
}
