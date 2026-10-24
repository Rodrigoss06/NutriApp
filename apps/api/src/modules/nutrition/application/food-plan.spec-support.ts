import {
  emptyMenuDays,
  type FoodItem,
  type MenuCell,
  type RecipeItem,
  type WeeklyMenuDraft,
} from '../domain/food-plan.js';
import type { FoodPlanSources } from './food-plan-calculation.js';
import type { PlanTargets } from './plan-calculation.js';

export const RICE = '01927000-0000-7000-8000-000000000001';
export const CHICKEN = '01927000-0000-7000-8000-000000000002';
export const EGG = '01927000-0000-7000-8000-000000000003';
export const STEW = '01927000-0000-7000-8000-000000000004';

/** Valores sintéticos por 100 g. Como en la TPCA, el huevo no trae carbohidratos y el arroz, fibra (RN-I03). */
export const SOURCES: FoodPlanSources = {
  nutrients: [
    { code: 'ENERC_KCAL', name: 'Energía', unit: 'kcal', core: true },
    { code: 'PROCNT', name: 'Proteínas', unit: 'g', core: true },
    { code: 'FAT', name: 'Grasa total', unit: 'g', core: true },
    { code: 'CHOCDF', name: 'Carbohidratos totales', unit: 'g', core: true },
    { code: 'FIBTG', name: 'Fibra dietaria', unit: 'g', core: true },
    { code: 'NA', name: 'Sodio', unit: 'mg', core: false },
  ],
  foods: new Map([
    [
      RICE,
      {
        name: 'Arroz cocido',
        state: 'COOKED',
        nutrientsPer100g: { ENERC_KCAL: 120, PROCNT: 2, FAT: 0.5, CHOCDF: 25, FIBTG: null, NA: 1 },
      },
    ],
    [
      CHICKEN,
      {
        name: 'Pollo',
        state: 'RAW',
        nutrientsPer100g: { ENERC_KCAL: 110, PROCNT: 20, FAT: 3, CHOCDF: 0, FIBTG: 0, NA: 70 },
      },
    ],
    [
      EGG,
      {
        name: 'Huevo',
        state: 'RAW',
        nutrientsPer100g: { ENERC_KCAL: 140, PROCNT: 12, FAT: 10, CHOCDF: null, FIBTG: 0, NA: 140 },
      },
    ],
  ]),
  recipes: new Map([
    [
      STEW,
      {
        name: 'Arroz con pollo',
        servings: 2,
        ingredients: [
          { foodId: RICE, grams: 200 },
          { foodId: CHICKEN, grams: 150 },
        ],
      },
    ],
  ]),
};

/** Metas sintéticas. */
export const TARGETS: PlanTargets = { kcal: 1000, choG: 100, proteinG: 50, fatG: 30 };

export const food = (foodId: string, grams: number): FoodItem => ({
  itemType: 'FOOD',
  foodId,
  grams,
  householdText: null,
});
export const recipe = (recipeId: string, servings: number): RecipeItem => ({
  itemType: 'RECIPE',
  recipeId,
  servings,
});

export const cell = (
  optionA: MenuCell['optionA'],
  optionB: MenuCell['optionB'] = [],
): MenuCell => ({
  optionA,
  optionB,
});

/**
 * De lunes a sábado, huevo en el desayuno; el domingo, arroz. En el almuerzo, dos porciones de arroz con pollo, con
 * pollo solo como opción B.
 */
export const MENU: WeeklyMenuDraft = {
  meals: [
    { slotCode: 'BREAKFAST', name: 'Desayuno', timeOfDay: null, sharePct: 50 },
    { slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: null, sharePct: 50 },
  ],
  days: emptyMenuDays(2).map((_, d) => ({
    meals: [cell([food(d === 6 ? RICE : EGG, 100)]), cell([recipe(STEW, 2)], [food(CHICKEN, 200)])],
  })),
  hydrationTargetMl: 2000,
  instructions: null,
};
