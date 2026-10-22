import { describe, expect, it } from 'vitest';
import { DEFAULT_MEALS, type PlanDraftInput } from '../domain/nutrition-plan.js';
import { calculatePlan, type PlanList, type PlanTargets } from './plan-calculation.js';

/**
 * G-17: las metas exactas de Luis, encadenadas desde su prescripción (≈ 1834.54 kcal, 2 g/kg y 25 % de grasa). Con
 * las metas redondeadas, la adecuación de grasa daría 103.9 en vez de 104.0.
 */
const LUIS: PlanTargets = {
  kcal: 1834.5357142857142,
  choG: 183.97544642857142,
  proteinG: 160,
  fatG: 50.95932539682539,
};

/** La lista DEMO del motor, como la carga la migración de P8 (riesgo R4). */
const DEMO: PlanList = {
  id: '01926200-0000-7000-8000-000000000001',
  code: 'DEMO',
  name: 'Lista de demostración',
  version: '1.0.0',
  provisional: true,
  groups: [
    { code: 'VEG', name: 'Verduras', choG: 5, proteinG: 2, fatG: 0, kcal: 28 },
    { code: 'FRU', name: 'Frutas', choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
    { code: 'MILK', name: 'Lácteos', choG: 12, proteinG: 8, fatG: 0, kcal: 80 },
    { code: 'STA', name: 'Almidones', choG: 15, proteinG: 3, fatG: 1, kcal: 81 },
    { code: 'MEAT', name: 'Carnes magras', choG: 0, proteinG: 7, fatG: 2, kcal: 46 },
    { code: 'FAT', name: 'Grasas', choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  ],
};

const G18: PlanDraftInput = {
  fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
  overrides: {},
  meals: DEFAULT_MEALS,
  splitOverrides: {},
  hydrationTargetMl: null,
  instructions: null,
};

const calculated = (input = G18, rangePct: readonly [number, number] = [90, 110]) => {
  const result = calculatePlan(input, LUIS, DEMO, rangePct);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('G-18 · RN-E08 · RN-E10 · intercambios de Luis con la lista de demostración', () => {
  it('fijando 4 verduras, 3 frutas y 3 lácteos: 6 almidones, 16 carnes y 3 grasas', () => {
    expect(calculated().plan.exchanges.map((e) => [e.groupCode, e.servings])).toEqual([
      ['VEG', 4],
      ['FRU', 3],
      ['MILK', 3],
      ['STA', 6],
      ['MEAT', 16],
      ['FAT', 3],
    ]);
  });

  it('totales 191 g de carbohidratos, 162 de proteína, 53 de grasa y 1889 kcal; adecuación 103.0, 103.8, 101.3 y 104.0', () => {
    const { totals, adequacy } = calculated();

    expect(totals).toEqual({ choG: 191, proteinG: 162, fatG: 53, kcal: 1889 });
    expect(adequacy.kcal.pct).toBeCloseTo(103.0, 1);
    expect(adequacy.cho.pct).toBeCloseTo(103.8, 1);
    expect(adequacy.protein.pct).toBeCloseTo(101.3, 1);
    expect(adequacy.fat.pct).toBeCloseTo(104.0, 1);
    expect(adequacy.rangePct).toEqual([90, 110]);
    expect(
      [adequacy.kcal, adequacy.cho, adequacy.protein, adequacy.fat].every((a) => a.inRange),
    ).toBe(true);
  });

  it('el rango aceptable es el de la organización (RN-E10)', () => {
    const { adequacy } = calculated(G18, [95, 103.5]);

    expect(
      [adequacy.kcal, adequacy.cho, adequacy.protein, adequacy.fat].map((a) => a.inRange),
    ).toEqual([true, false, true, false]);
  });

  it('el ajuste a mano se recalcula al instante: una carne menos baja la proteína a 155 g', () => {
    const { totals, adequacy } = calculated({ ...G18, overrides: { MEAT: 15 } });

    expect(totals.proteinG).toBe(155);
    expect(adequacy.protein.pct).toBeCloseTo((155 / 160) * 100, 9);
  });
});

describe('G-19 · RN-E09 · reparto 25, 10, 35, 10 y 20 %', () => {
  it('6 almidones: 1, 1, 2, 1, 1. 16 carnes: 4, 2, 5, 2, 3', () => {
    const { meals } = calculated().plan;

    expect(meals.map((m) => m.servings.STA)).toEqual([1, 1, 2, 1, 1]);
    expect(meals.map((m) => m.servings.MEAT)).toEqual([4, 2, 5, 2, 3]);
  });
});

describe('RN-D01 · RN-D02 · cada cálculo con su método', () => {
  it('intercambios, el reparto de cada grupo y las cuatro adecuaciones, con versión y hash', () => {
    const { methods } = calculated();

    expect(methods.map((m) => m.methodCode)).toEqual([
      'EXCHANGES_CLASSIC',
      ...Array<string>(6).fill('MEAL_SPLIT_LARGEST_REMAINDER'),
      ...Array<string>(4).fill('ADEQUACY'),
    ]);
    expect(
      methods.every((m) => m.methodVersion === '1.0.0' && /^[0-9a-f]{64}$/.test(m.inputsHash)),
    ).toBe(true);
  });

  it('una lista sin los seis grupos no sirve para el método clásico (NC-ENG-304)', () => {
    const result = calculatePlan(
      G18,
      LUIS,
      { ...DEMO, groups: DEMO.groups.slice(0, 5) },
      [90, 110],
    );

    expect(!result.ok && result.error).toMatchObject({
      code: 'NC-NUT-011',
      rule: 'RN-E08',
      details: { methodCode: 'EXCHANGES_CLASSIC', engineCode: 'NC-ENG-304' },
    });
  });
});
