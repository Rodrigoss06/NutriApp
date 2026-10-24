import { describe, expect, it } from 'vitest';
import { createNutritionPlanSchema, updateNutritionPlanSchema } from './plan.js';

const PRESCRIPTION = '0192a000-0000-7000-8000-000000000001';
const LIST = '0192a000-0000-7000-8000-000000000002';
const FOOD = '0192a000-0000-7000-8000-000000000003';
const RECIPE = '0192a000-0000-7000-8000-000000000004';

const meal = { slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: null, sharePct: 100 };
const food = { itemType: 'FOOD', foodId: FOOD, grams: 150, householdText: ' 1 taza ' };
const recipe = { itemType: 'RECIPE', recipeId: RECIPE, servings: 1 };
const week = (cell: unknown) => Array.from({ length: 7 }, () => ({ meals: [cell] }));

describe('RF-19 a RF-21 · crear un plan', () => {
  it('solo los intercambios llevan lista (RN-E11)', () => {
    expect(
      createNutritionPlanSchema.safeParse({
        modality: 'EXCHANGES',
        energyPrescriptionId: PRESCRIPTION,
      }).success,
    ).toBe(false);
    expect(
      createNutritionPlanSchema.parse({
        modality: 'WEEKLY_MENU',
        energyPrescriptionId: PRESCRIPTION,
        exchangeListId: LIST,
      }),
    ).toEqual({ modality: 'WEEKLY_MENU', energyPrescriptionId: PRESCRIPTION });
  });

  it('sin modalidad no se crea', () => {
    expect(
      createNutritionPlanSchema.safeParse({
        energyPrescriptionId: PRESCRIPTION,
        exchangeListId: LIST,
      }).success,
    ).toBe(false);
  });
});

describe('RF-20 · RN-E16 · borrador por composición', () => {
  const draft = { modality: 'COMPOSITION', hydrationTargetMl: 2000, instructions: null };

  it('alimentos con gramos y su medida casera, sin espacios de más', () => {
    const parsed = updateNutritionPlanSchema.parse({
      ...draft,
      meals: [{ ...meal, items: [food] }],
    });
    expect(parsed.modality === 'COMPOSITION' && parsed.meals[0]?.items[0]?.householdText).toBe(
      '1 taza',
    );
  });

  it('las recetas van en el menú, no en la composición', () => {
    expect(
      updateNutritionPlanSchema.safeParse({ ...draft, meals: [{ ...meal, items: [recipe] }] })
        .success,
    ).toBe(false);
  });

  it('un alimento pesa más de cero gramos', () => {
    expect(
      updateNutritionPlanSchema.safeParse({
        ...draft,
        meals: [{ ...meal, items: [{ ...food, grams: 0 }] }],
      }).success,
    ).toBe(false);
  });
});

describe('RF-21 · RN-E16 · borrador del menú semanal', () => {
  const draft = {
    modality: 'WEEKLY_MENU',
    meals: [meal],
    hydrationTargetMl: null,
    instructions: null,
  };

  it('siete días con alimentos o recetas en las opciones A y B', () => {
    const parsed = updateNutritionPlanSchema.parse({
      ...draft,
      days: week({ optionA: [recipe], optionB: [food] }),
    });
    expect(parsed.modality === 'WEEKLY_MENU' && parsed.days[6]?.meals[0]?.optionA).toEqual([
      recipe,
    ]);
  });

  it('ni seis ni ocho días', () => {
    const cell = { optionA: [food], optionB: [] };
    expect(
      updateNutritionPlanSchema.safeParse({ ...draft, days: week(cell).slice(1) }).success,
    ).toBe(false);
    expect(
      updateNutritionPlanSchema.safeParse({ ...draft, days: [...week(cell), { meals: [cell] }] })
        .success,
    ).toBe(false);
  });

  it('una receta va en más de cero porciones', () => {
    expect(
      updateNutritionPlanSchema.safeParse({
        ...draft,
        days: week({ optionA: [{ ...recipe, servings: 0 }], optionB: [] }),
      }).success,
    ).toBe(false);
  });
});
