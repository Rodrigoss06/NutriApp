import { describe, expect, it } from 'vitest';
import {
  compositionPlan,
  compositionPublishProblems,
  emptyMenuDays,
  weeklyMenuPlan,
  weeklyMenuPublishProblems,
  type CompositionDraft,
  type FoodItem,
  type MealHeader,
  type MenuCell,
  type RecipeItem,
  type WeeklyMenuDraft,
} from './food-plan.js';

const RICE = '01927000-0000-7000-8000-000000000001';
const CHICKEN = '01927000-0000-7000-8000-000000000002';
const STEW = '01927000-0000-7000-8000-000000000003';

const food = (foodId: string, grams: number, householdText: string | null = null): FoodItem => ({
  itemType: 'FOOD',
  foodId,
  grams,
  householdText,
});
const recipe = (recipeId: string, servings: number): RecipeItem => ({
  itemType: 'RECIPE',
  recipeId,
  servings,
});

const BREAKFAST: MealHeader = {
  slotCode: 'BREAKFAST',
  name: 'Desayuno',
  timeOfDay: '07:30',
  sharePct: 30,
};

/** Tres tiempos: 30, 40 y 30 %. */
const MEALS: readonly MealHeader[] = [
  BREAKFAST,
  { slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: null, sharePct: 40 },
  { slotCode: 'DINNER', name: 'Cena', timeOfDay: null, sharePct: 30 },
];

const COMPOSITION: CompositionDraft = {
  meals: MEALS.map((meal, index) => ({ ...meal, items: [food(RICE, 100 + index)] })),
  hydrationTargetMl: 2000,
  instructions: null,
};

const cell = (optionA: MenuCell['optionA'], optionB: MenuCell['optionB'] = []): MenuCell => ({
  optionA,
  optionB,
});

/** Siete días con algo en la opción A de cada tiempo. */
const MENU: WeeklyMenuDraft = {
  meals: MEALS,
  days: emptyMenuDays(MEALS.length).map(() => ({
    meals: [
      cell([food(RICE, 150)]),
      cell([recipe(STEW, 1)], [food(CHICKEN, 120)]),
      cell([food(CHICKEN, 100)]),
    ],
  })),
  hydrationTargetMl: 2000,
  instructions: null,
};

const problems = (
  result: ReturnType<typeof compositionPlan> | ReturnType<typeof weeklyMenuPlan>,
) => (result.ok ? [] : result.error.details?.problems);

describe('RN-E16 · dieta por composición', () => {
  it('un borrador válido guarda los gramos con los dos decimales de la base', () => {
    const result = compositionPlan({
      ...COMPOSITION,
      meals: [{ ...BREAKFAST, sharePct: 100, items: [food(RICE, 123.456, '1 taza')] }],
    });
    expect(result.ok && result.value.meals[0]?.items[0]).toEqual(food(RICE, 123.46, '1 taza'));
  });

  it('RN-E09 · los porcentajes de los tiempos suman 100, con centésimas', () => {
    expect(
      problems(
        compositionPlan({
          ...COMPOSITION,
          meals: COMPOSITION.meals.map((meal) => ({ ...meal, sharePct: 33.33 })),
        }),
      ),
    ).toEqual(['Los porcentajes de los tiempos de comida suman 99.99: deben sumar 100 (RN-E09).']);
    const thirds = [33.33, 33.33, 33.34];
    const result = compositionPlan({
      ...COMPOSITION,
      meals: COMPOSITION.meals.map((meal, i) => ({ ...meal, sharePct: thirds[i] ?? 0 })),
    });
    expect(result.ok).toBe(true);
  });

  it('RN-E12 · un alimento que redondea a 0 g no entra', () => {
    expect(
      problems(
        compositionPlan({
          ...COMPOSITION,
          meals: [{ ...BREAKFAST, sharePct: 100, items: [food(RICE, 0.001)] }],
        }),
      ),
    ).toEqual(['Desayuno: cada alimento pesa más de 0 g (RN-E12).']);
  });

  it('un tiempo sin alimentos se guarda: se completa antes de publicar', () => {
    const result = compositionPlan({
      ...COMPOSITION,
      meals: COMPOSITION.meals.map((meal) => ({ ...meal, items: [] })),
    });
    expect(result.ok).toBe(true);
  });
});

describe('RN-E13 · RN-G05 · lo que falta para publicar una composición', () => {
  it('con hidratación y algo en cada tiempo, nada', () => {
    expect(compositionPublishProblems(COMPOSITION)).toEqual([]);
  });

  it('la meta de hidratación y al menos un alimento por tiempo', () => {
    expect(
      compositionPublishProblems({
        ...COMPOSITION,
        hydrationTargetMl: null,
        meals: COMPOSITION.meals.map((meal, i) => (i === 1 ? { ...meal, items: [] } : meal)),
      }),
    ).toEqual([
      'Falta la meta de hidratación (RN-E13).',
      'Almuerzo: agrega al menos un alimento (RN-G05).',
    ]);
  });
});

describe('RN-E16 · menú semanal', () => {
  it('un borrador válido redondea gramos y porciones a centésimas', () => {
    const result = weeklyMenuPlan({
      ...MENU,
      days: MENU.days.map((day) => ({
        meals: day.meals.map((c, m) =>
          m === 1 ? cell([recipe(STEW, 1.234)], [food(CHICKEN, 99.999)]) : c,
        ),
      })),
    });
    expect(result.ok && result.value.days[6]?.meals[1]).toEqual(
      cell([recipe(STEW, 1.23)], [food(CHICKEN, 100)]),
    );
  });

  it('tiene 7 días, de lunes a domingo', () => {
    expect(problems(weeklyMenuPlan({ ...MENU, days: MENU.days.slice(0, 6) }))).toEqual([
      'El menú tiene 6 días: deben ser 7, de lunes a domingo (RN-E16).',
    ]);
  });

  it('cada día tiene una celda por tiempo de comida', () => {
    const days = MENU.days.map((day, d) => (d === 2 ? { meals: day.meals.slice(0, 2) } : day));
    expect(problems(weeklyMenuPlan({ ...MENU, days }))).toEqual([
      'Miércoles: tiene 2 tiempos de comida y el menú tiene 3 (RN-E16).',
    ]);
  });

  it('una receta va en más de 0 porciones', () => {
    const days = MENU.days.map((day, d) =>
      d === 0 ? { meals: [cell([recipe(STEW, 0.001)]), ...day.meals.slice(1)] } : day,
    );
    expect(problems(weeklyMenuPlan({ ...MENU, days }))).toEqual([
      'Lunes · Desayuno: cada receta va en más de 0 porciones (RN-E16).',
    ]);
  });

  it('RN-E09 · los porcentajes de los tiempos suman 100', () => {
    expect(
      problems(
        weeklyMenuPlan({ ...MENU, meals: MEALS.map((meal) => ({ ...meal, sharePct: 50 })) }),
      ),
    ).toEqual(['Los porcentajes de los tiempos de comida suman 150: deben sumar 100 (RN-E09).']);
  });
});

describe('RN-E13 · RN-G05 · lo que falta para publicar un menú', () => {
  it('con hidratación y la opción A en cada tiempo de los 7 días, nada: la B es opcional', () => {
    expect(weeklyMenuPublishProblems(MENU)).toEqual([]);
  });

  it('la opción A que falta, por tiempo y con sus días', () => {
    const days = MENU.days.map((day, d) => ({
      meals: day.meals.map((c, m) => {
        if (m === 0) return cell([], [food(RICE, 100)]);
        if (m === 1 && (d === 1 || d === 3)) return cell([]);
        return c;
      }),
    }));
    expect(weeklyMenuPublishProblems({ ...MENU, hydrationTargetMl: null, days })).toEqual([
      'Falta la meta de hidratación (RN-E13).',
      'Desayuno: falta la opción A todos los días (RN-G05).',
      'Almuerzo: falta la opción A el martes y el jueves (RN-G05).',
    ]);
  });

  it('un menú nuevo no tiene nada en ningún día', () => {
    expect(emptyMenuDays(2)).toHaveLength(7);
    expect(emptyMenuDays(2)[0]).toEqual({ meals: [cell([]), cell([])] });
  });
});
