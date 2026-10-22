import { ENGINE_VERSION } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import type { FoodRecord } from './ports/food.port.js';
import { composePlate, gramsOf } from './plate-composition.js';

const NUTRIENTS = [
  { code: 'ENERC_KCAL', name: 'Energía', unit: 'kcal', core: true },
  { code: 'PROCNT', name: 'Proteínas', unit: 'g', core: true },
  { code: 'FIBTG', name: 'Fibra dietaria', unit: 'g', core: true },
] as const;

/** Un alimento sintético con sus valores por 100 g; null es «sin dato». */
function food(id: string, name: string, values: Record<string, number | null>): FoodRecord {
  return {
    id,
    name,
    sourceCode: 'TPCA_2017',
    sourceFoodCode: id,
    groupName: null,
    state: 'COOKED',
    own: false,
    energyKcalPer100g: values.ENERC_KCAL ?? null,
    organizationId: null,
    ediblePortionPct: 100,
    tags: [],
    version: 0,
    source: { code: 'TPCA_2017', name: 'TPCA', edition: null },
    nutrients: NUTRIENTS.map((n) => ({
      ...n,
      nutrientCode: n.code,
      valuePer100g: values[n.code] ?? null,
      flag: values[n.code] === null ? 'MISSING' : null,
    })),
    measures: [
      { id: 'm-taza', name: 'Taza', grams: 150, grossGrams: null, sourceCode: 'TAFERA_2016' },
    ],
    cookingFactors: [],
  };
}

const RICE = food('A2', 'Arroz cocido', { ENERC_KCAL: 115, PROCNT: 2.4, FIBTG: null });
const BEANS = food('T64', 'Frejol sancochado', { ENERC_KCAL: 119, PROCNT: 10.1, FIBTG: 6.8 });

describe('RN-E12 · RN-E16 · lo que aporta un plato', () => {
  it('gramos × valor por 100 g ÷ 100, sumados; con el método y la versión del motor (RN-D01)', () => {
    const plate = composePlate(
      [
        { food: RICE, grams: 150, measure: 'Taza', quantity: 1 },
        { food: BEANS, grams: 120, measure: null, quantity: null },
      ],
      NUTRIENTS,
    );

    expect(plate).toMatchObject({
      methodCode: 'RECIPE_NUTRIENTS',
      methodVersion: '1.0.0',
      engineVersion: ENGINE_VERSION,
      weightG: 270,
    });
    expect(plate.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    const total = (code: string) => plate.totals.find((t) => t.code === code)?.value;
    expect(total('ENERC_KCAL')).toBeCloseTo(172.5 + 142.8, 6);
    expect(total('PROCNT')).toBeCloseTo(3.6 + 12.12, 6);
  });

  it('RN-I03: si a un alimento le falta un nutriente, el total es «sin dato», no la suma de los demás', () => {
    const plate = composePlate(
      [
        { food: RICE, grams: 150, measure: null, quantity: null },
        { food: BEANS, grams: 120, measure: null, quantity: null },
      ],
      NUTRIENTS,
    );

    expect(plate.totals.find((t) => t.code === 'FIBTG')).toEqual({
      code: 'FIBTG',
      name: 'Fibra dietaria',
      unit: 'g',
      core: true,
      value: null,
    });
  });

  it('avisa que la 1.0 no aplica factores de retención de micronutrientes (RN-E12)', () => {
    const plate = composePlate(
      [{ food: BEANS, grams: 100, measure: null, quantity: null }],
      NUTRIENTS,
    );

    expect(plate.issues).toEqual([expect.objectContaining({ rule: 'RN-E12', code: 'NC-ENG-307' })]);
  });

  it('una medida casera aporta sus gramos de parte comestible por la cantidad', () => {
    expect(gramsOf(RICE, { foodId: 'A2', measureId: 'm-taza', quantity: 1.5 })).toEqual({
      ok: true,
      value: { grams: 225, measure: 'Taza', quantity: 1.5 },
    });
    expect(gramsOf(RICE, { foodId: 'A2', grams: 80 })).toEqual({
      ok: true,
      value: { grams: 80, measure: null, quantity: null },
    });
    expect(gramsOf(RICE, { foodId: 'A2', measureId: 'otra', quantity: 1 })).toMatchObject({
      ok: false,
      error: { code: 'NC-FOOD-005', rule: 'RN-E12' },
    });
  });
});
