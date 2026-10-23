import { describe, expect, it } from 'vitest';
import { recipeRequestSchema, recipeSearchQuerySchema } from './recipe.js';

const FOOD = '0192a000-0000-7000-8000-000000000001';

describe('RF-21 · RN-E12 · receta', () => {
  it('lo opcional queda vacío: sin peso cocido, sin preparación, sin etiquetas ni medida casera', () => {
    expect(
      recipeRequestSchema.parse({
        name: 'Arroz con pollo',
        servings: 2,
        ingredients: [{ foodId: FOOD, grams: 200 }],
      }),
    ).toEqual({
      name: 'Arroz con pollo',
      servings: 2,
      cookedWeightG: null,
      instructions: null,
      tags: [],
      ingredients: [{ foodId: FOOD, grams: 200, householdText: null }],
    });
  });

  it('una preparación o una medida en blanco es lo mismo que no tenerla', () => {
    const parsed = recipeRequestSchema.parse({
      name: 'Arroz con pollo',
      servings: 2,
      instructions: '   ',
      ingredients: [{ foodId: FOOD, grams: 200, householdText: ' ' }],
    });
    expect(parsed.instructions).toBeNull();
    expect(parsed.ingredients[0]?.householdText).toBeNull();
  });

  it('rinde más de cero porciones, con al menos un ingrediente de más de cero gramos', () => {
    const base = { name: 'Arroz con pollo', ingredients: [{ foodId: FOOD, grams: 200 }] };
    expect(recipeRequestSchema.safeParse({ ...base, servings: 0 }).success).toBe(false);
    expect(recipeRequestSchema.safeParse({ ...base, servings: 2, ingredients: [] }).success).toBe(
      false,
    );
    expect(
      recipeRequestSchema.safeParse({
        ...base,
        servings: 2,
        ingredients: [{ foodId: FOOD, grams: 0 }],
      }).success,
    ).toBe(false);
  });

  it('la búsqueda muestra las activas salvo que se pidan las archivadas', () => {
    expect(recipeSearchQuerySchema.parse({})).toEqual({ status: 'ACTIVE', limit: 20 });
    expect(recipeSearchQuerySchema.parse({ status: 'ARCHIVED', limit: '5' })).toEqual({
      status: 'ARCHIVED',
      limit: 5,
    });
  });
});
