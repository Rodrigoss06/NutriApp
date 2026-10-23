import { ENGINE_VERSION } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import { recipe, type RecipeInput } from '../domain/recipe.js';
import { foodRecord, NUTRIENTS } from './food-fakes.spec-support.js';
import { recipeNutrients } from './recipe-nutrients.js';

/** Arroz y pollo sintéticos: al arroz le falta la fibra. */
const RICE = foodRecord('rice', 'Arroz cocido', { ENERC_KCAL: 115, PROCNT: 2.4, FIBTG: null });
const CHICKEN = foodRecord('chicken', 'Pollo', { ENERC_KCAL: 119, PROCNT: 21.4, FIBTG: 0 }, 'RAW');

const INPUT: RecipeInput = {
  name: 'Arroz con pollo',
  servings: 2,
  cookedWeightG: null,
  instructions: null,
  tags: [],
  ingredients: [
    { foodId: 'rice', grams: 200, householdText: null },
    { foodId: 'chicken', grams: 150, householdText: null },
  ],
};

const valid = (input: RecipeInput) => {
  const result = recipe(input);
  if (!result.ok) throw new Error('la receta de prueba es válida');
  return result.value;
};

describe('RN-E12 · RN-E16 · nutrientes por porción de una receta', () => {
  it('Σ gramos × valor por 100 g ÷ 100, dividido entre las porciones, con el método y la versión (RN-D01)', () => {
    const nutrients = recipeNutrients(valid(INPUT), [RICE, CHICKEN], NUTRIENTS);

    expect(nutrients).toMatchObject({
      methodCode: 'RECIPE_NUTRIENTS',
      methodVersion: '1.1.0',
      engineVersion: ENGINE_VERSION,
      ingredientCount: 2,
      rawWeightG: 350,
      yieldFactor: null,
      per100gCooked: null,
    });
    expect(nutrients.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(nutrients.perServing.ENERC_KCAL?.value).toBeCloseTo((230 + 178.5) / 2, 10);
    expect(nutrients.perServing.PROCNT?.value).toBeCloseTo((4.8 + 32.1) / 2, 10);
    expect(nutrients.warnings).toEqual([expect.objectContaining({ code: 'NC-ENG-307' })]);
  });

  it('RN-I03 · si a un ingrediente le falta el dato, es «sin dato»; lo conocido va aparte con cuántos faltan', () => {
    const nutrients = recipeNutrients(valid(INPUT), [RICE, CHICKEN], NUTRIENTS);

    expect(nutrients.perServing.FIBTG).toEqual({ value: null, known: 0, missing: 1 });
    expect(nutrients.perServing.ENERC_KCAL?.missing).toBe(0);
  });

  it('con el peso cocido, el factor de rendimiento y los nutrientes por 100 g cocidos', () => {
    const nutrients = recipeNutrients(
      valid({ ...INPUT, cookedWeightG: 500 }),
      [RICE, CHICKEN],
      NUTRIENTS,
    );

    expect(nutrients.yieldFactor).toBeCloseTo(500 / 350, 12);
    expect(nutrients.per100gCooked?.ENERC_KCAL).toBeCloseTo(((230 + 178.5) / 500) * 100, 10);
    expect(nutrients.per100gCooked?.FIBTG).toBeNull();
  });

  it('el mismo alimento dos veces suma las dos cantidades', () => {
    const nutrients = recipeNutrients(
      valid({
        ...INPUT,
        servings: 1,
        ingredients: [
          { foodId: 'rice', grams: 100, householdText: null },
          { foodId: 'rice', grams: 50, householdText: null },
        ],
      }),
      [RICE],
      NUTRIENTS,
    );

    expect(nutrients.perServing.ENERC_KCAL?.value).toBeCloseTo(172.5, 10);
  });
});
