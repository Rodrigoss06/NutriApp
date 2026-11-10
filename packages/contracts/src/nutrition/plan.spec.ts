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
      { ...recipe, byProfile: {} },
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

describe('07 §2 · P-20.5 · las porciones de cada perfil de día', () => {
  it('un alimento o una receta cambian su cantidad en un perfil; 0 es «ese día no va»', () => {
    const parsed = updateNutritionPlanSchema.parse({
      modality: 'WEEKLY_MENU',
      meals: [meal],
      hydrationTargetMl: null,
      instructions: null,
      days: week({
        optionA: [
          { ...food, byProfile: { REST: { grams: 100, householdText: ' ½ taza ' } } },
          { ...recipe, byProfile: { REST: { servings: 0 } } },
        ],
        optionB: [],
      }),
    });
    expect(parsed.modality === 'WEEKLY_MENU' && parsed.days[0]?.meals[0]?.optionA).toEqual([
      {
        ...food,
        householdText: '1 taza',
        byProfile: { REST: { grams: 100, householdText: '½ taza' } },
      },
      { ...recipe, byProfile: { REST: { servings: 0 } } },
    ]);
  });

  it('el código del perfil va en mayúsculas y la cantidad no es negativa', () => {
    const items = (byProfile: unknown) => ({
      modality: 'COMPOSITION',
      hydrationTargetMl: null,
      instructions: null,
      meals: [{ ...meal, items: [{ ...food, byProfile }] }],
    });
    expect(
      updateNutritionPlanSchema.safeParse(items({ rest: { grams: 100, householdText: null } }))
        .success,
    ).toBe(false);
    expect(
      updateNutritionPlanSchema.safeParse(items({ REST: { grams: -1, householdText: null } }))
        .success,
    ).toBe(false);
  });

  it('en intercambios, los almidones de cada tiempo de un perfil; sin ellos, la sugerencia', () => {
    const exchanges = {
      modality: 'EXCHANGES',
      fixedServings: { VEG: 3, FRU: 2, MILK: 2 },
      overrides: {},
      meals: [{ ...meal, allowedFoods: [] }],
      splitOverrides: {},
      hydrationTargetMl: null,
      instructions: null,
    };
    const parsed = updateNutritionPlanSchema.parse(exchanges);
    expect(parsed.modality === 'EXCHANGES' && parsed.starchByProfile).toEqual({});
    const manual = updateNutritionPlanSchema.parse({
      ...exchanges,
      starchByProfile: { REST: [4] },
    });
    expect(manual.modality === 'EXCHANGES' && manual.starchByProfile).toEqual({ REST: [4] });
    expect(
      updateNutritionPlanSchema.safeParse({ ...exchanges, starchByProfile: { REST: [1.5] } })
        .success,
    ).toBe(false);
  });
});
