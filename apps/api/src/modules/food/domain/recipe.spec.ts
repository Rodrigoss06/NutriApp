import { describe, expect, it } from 'vitest';
import { recipe, recipeChangedFields, type RecipeInput } from './recipe.js';

const RICE = '00000000-0000-4000-8000-000000000001';
const CHICKEN = '00000000-0000-4000-8000-000000000002';

/** Arroz con pollo de prueba, sintético. */
const RICE_AND_CHICKEN: RecipeInput = {
  name: 'Arroz con pollo',
  servings: 2,
  cookedWeightG: null,
  instructions: null,
  tags: ['almuerzo'],
  ingredients: [
    { foodId: RICE, grams: 200, householdText: '1 taza' },
    { foodId: CHICKEN, grams: 150, householdText: null },
  ],
};

const problems = (input: RecipeInput): unknown => {
  const result = recipe(input);
  return result.ok ? [] : result.error.details?.problems;
};

describe('RN-E12 · receta de la organización', () => {
  it('guarda los ingredientes en su orden, con los gramos de parte comestible y la medida con que se ingresaron', () => {
    const result = recipe({ ...RICE_AND_CHICKEN, tags: [' almuerzo ', 'Almuerzo', 'pollo'] });

    expect(result.ok && result.value).toEqual({
      name: 'Arroz con pollo',
      servings: 2,
      cookedWeightG: null,
      instructions: null,
      tags: ['almuerzo', 'pollo'],
      ingredients: [
        { position: 1, foodId: RICE, grams: 200, householdText: '1 taza' },
        { position: 2, foodId: CHICKEN, grams: 150, householdText: null },
      ],
    });
  });

  it('rinde más de cero porciones y, si se registra, pesa más de cero cocida', () => {
    const result = recipe({ ...RICE_AND_CHICKEN, servings: 0, cookedWeightG: 0 });

    expect(!result.ok && result.error).toMatchObject({ code: 'NC-FOOD-007', rule: 'RN-E12' });
    expect(problems({ ...RICE_AND_CHICKEN, servings: 0, cookedWeightG: 0 })).toEqual([
      'La receta rinde más de cero porciones.',
      'El peso cocido es mayor que cero.',
    ]);
  });

  it('la base guarda dos decimales: gramos, porciones y peso cocido se calculan con lo que se guarda', () => {
    const result = recipe({
      ...RICE_AND_CHICKEN,
      servings: 2.505,
      cookedWeightG: 300.004,
      ingredients: [{ foodId: RICE, grams: 16.665, householdText: '½ unidad' }],
    });

    expect(result.ok && result.value).toMatchObject({
      servings: 2.51,
      cookedWeightG: 300,
      ingredients: [{ grams: 16.67 }],
    });
    expect(problems({ ...RICE_AND_CHICKEN, servings: 0.004 })).toEqual([
      'La receta rinde más de cero porciones.',
    ]);
  });

  it('sin ingredientes no hay nada que calcular', () => {
    expect(problems({ ...RICE_AND_CHICKEN, ingredients: [] })).toEqual([
      'Agrega al menos un ingrediente.',
    ]);
  });

  it('cada ingrediente pesa más de cero gramos', () => {
    expect(
      problems({
        ...RICE_AND_CHICKEN,
        ingredients: [{ foodId: RICE, grams: -5, householdText: null }],
      }),
    ).toEqual(['El ingrediente 1 pesa más de cero gramos.']);
  });

  it('el mismo alimento puede ir dos veces: el aceite del aderezo y el de la fritura', () => {
    const result = recipe({
      ...RICE_AND_CHICKEN,
      ingredients: [
        { foodId: RICE, grams: 10, householdText: null },
        { foodId: RICE, grams: 5, householdText: null },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('RN-B03 · la auditoría recibe los nombres de los campos que cambian, nunca sus valores', () => {
    const before = recipe(RICE_AND_CHICKEN);
    const after = recipe({
      ...RICE_AND_CHICKEN,
      servings: 4,
      ingredients: [{ foodId: RICE, grams: 200, householdText: '1 taza' }],
    });
    if (!before.ok || !after.ok) throw new Error('las recetas de prueba son válidas');

    expect(recipeChangedFields(before.value, after.value)).toEqual(['servings', 'ingredients']);
    expect(recipeChangedFields(before.value, before.value)).toEqual([]);
  });
});
