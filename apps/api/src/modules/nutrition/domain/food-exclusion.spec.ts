import { describe, expect, it } from 'vitest';
import type { CompositionDraft, MenuItem, PlanDraft, WeeklyMenuDraft } from './food-plan.js';
import { DEFAULT_MEAL_HEADERS, emptyMenuDays } from './food-plan.js';
import {
  excludedFoodProblems,
  planFoodUses,
  planRecipeIds,
  type FoodExclusion,
  type RecipeContents,
} from './food-exclusion.js';
import { DEFAULT_MEALS } from './nutrition-plan.js';

const PEANUT = 'mani';
const RICE = 'arroz';
const NAMES = new Map([
  [PEANUT, 'Maní tostado'],
  [RICE, 'Arroz cocido'],
]);
const ALLERGY: FoodExclusion = {
  conditionId: 'c1',
  kind: 'ALLERGY',
  label: 'Maní',
  foodIds: [PEANUT],
};
const RECIPES: ReadonlyMap<string, RecipeContents> = new Map([
  ['salsa', { name: 'Salsa de maní', foodIds: [RICE, PEANUT] }],
  ['arroz-solo', { name: 'Arroz graneado', foodIds: [RICE] }],
]);

const food = (foodId: string): MenuItem => ({
  itemType: 'FOOD',
  foodId,
  grams: 100,
  householdText: null,
});
const recipe = (recipeId: string): MenuItem => ({ itemType: 'RECIPE', recipeId, servings: 1 });

const composition = (lunch: readonly string[], dinner: readonly string[] = []): PlanDraft => {
  const draft: CompositionDraft = {
    meals: DEFAULT_MEAL_HEADERS.map((header) => ({
      ...header,
      items: (header.slotCode === 'LUNCH' ? lunch : header.slotCode === 'DINNER' ? dinner : []).map(
        (foodId) => ({ itemType: 'FOOD' as const, foodId, grams: 100, householdText: null }),
      ),
    })),
    hydrationTargetMl: null,
    instructions: null,
  };
  return { modality: 'COMPOSITION', ...draft };
};

const menu = (items: Readonly<Record<string, readonly MenuItem[]>>): PlanDraft => {
  const lunch = DEFAULT_MEAL_HEADERS.findIndex((header) => header.slotCode === 'LUNCH');
  const draft: WeeklyMenuDraft = {
    meals: DEFAULT_MEAL_HEADERS,
    days: emptyMenuDays(DEFAULT_MEAL_HEADERS.length).map((day, d) => ({
      meals: day.meals.map((cell, m) =>
        m === lunch ? { optionA: items[String(d)] ?? [], optionB: [] } : cell,
      ),
    })),
    hydrationTargetMl: null,
    instructions: null,
  };
  return { modality: 'WEEKLY_MENU', ...draft };
};

const exchanges = (foodId: string): PlanDraft => ({
  modality: 'EXCHANGES',
  fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
  overrides: {},
  splitOverrides: {},
  hydrationTargetMl: null,
  instructions: null,
  meals: DEFAULT_MEALS.map((meal) =>
    meal.slotCode === 'BREAKFAST'
      ? {
          ...meal,
          allowedFoods: [{ groupCode: 'STA', foodId, grams: 50, householdText: null }],
        }
      : meal,
  ),
});

const problemsOf = (draft: PlanDraft, exclusions: readonly FoodExclusion[] = [ALLERGY]) =>
  excludedFoodProblems(planFoodUses(draft, RECIPES), exclusions, NAMES);

describe('RN-E17 · un plan no lleva un alimento excluido por una alergia o intolerancia', () => {
  it('en una dieta por composición, con el tiempo de comida donde está', () => {
    expect(problemsOf(composition([PEANUT, RICE], [PEANUT]))).toEqual([
      'Maní tostado (Almuerzo, Cena): excluido por una alergia, «Maní» (RN-E17).',
    ]);
  });

  it('en los alimentos permitidos de una dieta por intercambios', () => {
    expect(problemsOf(exchanges(PEANUT))).toEqual([
      'Maní tostado (Desayuno): excluido por una alergia, «Maní» (RN-E17).',
    ]);
  });

  it('en un menú semanal, con el día y el tiempo', () => {
    expect(problemsOf(menu({ 1: [food(PEANUT)] }))).toEqual([
      'Maní tostado (Martes · Almuerzo): excluido por una alergia, «Maní» (RN-E17).',
    ]);
  });

  it('dentro de una receta del menú, aunque la receta no se llame como el alimento', () => {
    expect(problemsOf(menu({ 0: [recipe('salsa')], 3: [recipe('salsa')] }))).toEqual([
      'Receta «Salsa de maní» (Lunes · Almuerzo, Jueves · Almuerzo): lleva Maní tostado, excluido por una alergia, «Maní» (RN-E17).',
    ]);
  });

  it('una receta sin el alimento no molesta', () => {
    expect(problemsOf(menu({ 0: [recipe('arroz-solo')] }))).toEqual([]);
  });

  it('una intolerancia excluye igual que una alergia (07 §12)', () => {
    expect(
      problemsOf(composition([RICE]), [
        { conditionId: 'c2', kind: 'INTOLERANCE', label: 'Gluten', foodIds: [RICE] },
      ]),
    ).toEqual(['Arroz cocido (Almuerzo): excluido por una intolerancia, «Gluten» (RN-E17).']);
  });

  it('un alimento en dos condiciones se avisa por cada una', () => {
    expect(
      problemsOf(composition([PEANUT]), [
        ALLERGY,
        { conditionId: 'c2', kind: 'INTOLERANCE', label: 'Frutos secos', foodIds: [PEANUT] },
      ]),
    ).toEqual([
      'Maní tostado (Almuerzo): excluido por una alergia, «Maní» (RN-E17).',
      'Maní tostado (Almuerzo): excluido por una intolerancia, «Frutos secos» (RN-E17).',
    ]);
  });

  it('muestra hasta tres lugares y cuenta los demás', () => {
    const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [day, [food(PEANUT)]]));

    expect(problemsOf(menu(everyDay))).toEqual([
      'Maní tostado (Lunes · Almuerzo, Martes · Almuerzo, Miércoles · Almuerzo y 4 más): excluido por una alergia, «Maní» (RN-E17).',
    ]);
  });

  it('sin alimentos enlazados, o sin el alimento en el plan, no hay problema', () => {
    expect(problemsOf(composition([PEANUT]), [{ ...ALLERGY, foodIds: [] }])).toEqual([]);
    expect(problemsOf(composition([RICE]))).toEqual([]);
    expect(problemsOf(composition([PEANUT]), [])).toEqual([]);
  });

  it('una receta del plan sin cargar es una falla técnica, no un plan sin problemas', () => {
    expect(() => planFoodUses(menu({ 0: [recipe('borrada')] }), RECIPES)).toThrow(/borrada/);
  });

  it('las recetas que hay que cargar: solo las del menú, sin repetir', () => {
    expect(planRecipeIds(menu({ 0: [recipe('salsa')], 1: [recipe('salsa'), food(RICE)] }))).toEqual(
      ['salsa'],
    );
    expect(planRecipeIds(composition([RICE]))).toEqual([]);
  });
});
