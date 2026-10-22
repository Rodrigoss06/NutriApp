import { describe, expect, it } from 'vitest';
import {
  foodSearchQuerySchema,
  ownFoodRequestSchema,
  plateCompositionRequestSchema,
} from './catalog.js';

const FOOD = '0192a000-0000-7000-8000-000000000001';
const MEASURE = '0192a000-0000-7000-8000-000000000002';

describe('RN-E12 · ingredientes de un plato', () => {
  it('gramos de parte comestible, o una medida casera y cuántas', () => {
    expect(
      plateCompositionRequestSchema.safeParse({
        items: [
          { foodId: FOOD, grams: 150 },
          { foodId: FOOD, measureId: MEASURE, quantity: 0.5 },
        ],
      }).success,
    ).toBe(true);
  });

  it('nunca las dos cosas a la vez, ni un plato vacío', () => {
    expect(
      plateCompositionRequestSchema.safeParse({
        items: [{ foodId: FOOD, grams: 150, measureId: MEASURE, quantity: 1 }],
      }).success,
    ).toBe(false);
    expect(plateCompositionRequestSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('RN-I01 · RN-I03 · alimento propio y búsqueda', () => {
  it('sin medidas ni parte comestible: 100 % y ninguna medida; null es «sin dato»', () => {
    const parsed = ownFoodRequestSchema.parse({
      name: 'Pan de la casa',
      state: 'READY',
      nutrients: { ENERC_KCAL: 270, FIBTG: null },
    });

    expect(parsed).toMatchObject({ ediblePortionPct: 100, measures: [] });
    expect(parsed.nutrients.FIBTG).toBeNull();
  });

  it('la búsqueda trae 20 por defecto y 50 como máximo', () => {
    expect(foodSearchQuerySchema.parse({ q: ' platano ' })).toEqual({ q: 'platano', limit: 20 });
    expect(foodSearchQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});
