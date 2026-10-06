import { describe, expect, it } from 'vitest';
import {
  ADEQUACY,
  DEMO_EXCHANGE_LIST,
  EXCHANGES_CLASSIC,
  MACROS_PROTEIN_FIRST,
  MEAL_SPLIT_LARGEST_REMAINDER,
} from '../../src/diet/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { LUIS } from '../fixtures/luis.js';
import { luisDailyTargetKcal } from '../fixtures/luis-chain.js';
import { expectKcal, expectOk, roundHalfUp } from '../support.js';

const macros = () =>
  expectOk(
    runMethod(MACROS_PROTEIN_FIRST, {
      targetKcal: luisDailyTargetKcal(),
      weightKg: LUIS.weightKg,
      proteinGPerKg: 2,
      fatPctKcal: 25,
    }),
  ).outputs;

const exchanges = () => {
  const { choG, proteinG, fatG } = macros();
  return expectOk(
    runMethod(EXCHANGES_CLASSIC, {
      target: { choG, proteinG, fatG },
      fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
      list: DEMO_EXCHANGE_LIST,
    }),
  ).outputs;
};

const MEALS = [
  { meal: 'Desayuno', pct: 25 },
  { meal: 'Media mañana', pct: 10 },
  { meal: 'Almuerzo', pct: 35 },
  { meal: 'Media tarde', pct: 10 },
  { meal: 'Cena', pct: 20 },
];

describe('G-17 · RN-E07 · macronutrientes con proteína primero', () => {
  it('objetivo de G-16 (1835 kcal), 2 g/kg y 25 % de grasa: proteína 160 g; grasa 51 g; carbohidratos 184 g', () => {
    const { proteinG, fatG, choG } = macros();
    // Gramos enteros al presentar (RN-D09): la tolerancia de 03 para enteros es exacta.
    expect(roundHalfUp(proteinG, 0)).toBe(160);
    expect(roundHalfUp(fatG, 0)).toBe(51);
    expect(roundHalfUp(choG, 0)).toBe(184);
  });
});

describe('G-18 · RN-E08 y RN-E10 · intercambios con la lista de demostración', () => {
  it('6 almidones, 16 carnes, 3 grasas; totales y adecuación', () => {
    const { servings, totals, kcal, adequacyPct } = exchanges();

    expect(servings).toEqual({ VEG: 4, FRU: 3, MILK: 3, STA: 6, MEAT: 16, FAT: 3 });
    expect(totals).toEqual({ choG: 191, proteinG: 162, fatG: 53 });
    expect(kcal).toBe(1889);
    // 03 da estas adecuaciones con 1 decimal: se comparan a esa precisión.
    expect(adequacyPct.kcal).toBeCloseTo(103.0, 1);
    expect(adequacyPct.cho).toBeCloseTo(103.8, 1);
    expect(adequacyPct.protein).toBeCloseTo(101.3, 1);
    expect(adequacyPct.fat).toBeCloseTo(104.0, 1);
  });
});

describe('G-19 · RN-E09 · reparto por mayor residuo', () => {
  it('6 almidones: 1, 1, 2, 1, 1. 16 carnes: 4, 2, 5, 2, 3', () => {
    const split = (total: number) =>
      expectOk(
        runMethod(MEAL_SPLIT_LARGEST_REMAINDER, { totalServings: total, meals: MEALS }),
      ).outputs.servingsByMeal.map(({ servings }) => servings);

    expect(split(exchanges().servings.STA)).toEqual([1, 1, 2, 1, 1]);
    expect(split(exchanges().servings.MEAT)).toEqual([4, 2, 5, 2, 3]);
  });
});

describe('G-20 · RN-E10 y RN-G09 · semana de Luis contra 1835 kcal', () => {
  it('promedio 1910 kcal; adecuación 104.1 %; 4 de 7 días entre 90 y 110 %', () => {
    const { outputs } = expectOk(
      runMethod(ADEQUACY, {
        prescribed: luisDailyTargetKcal(),
        consumedDaily: [1790, 1950, 1600, 2100, 1830, 2400, 1700],
      }),
    );

    expectKcal(outputs.averageConsumed, 1910);
    expect(outputs.adequacyPct).toBeCloseTo(104.1, 1);
    expect(outputs.daysInRange).toBe(4);
    expect(outputs.dailyAdequacyPct).toHaveLength(7);
  });
});
