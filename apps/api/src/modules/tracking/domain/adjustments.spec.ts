import { describe, expect, it } from 'vitest';
import {
  adjustedFoods,
  adjustedWaterMl,
  foodCorrection,
  latestByTarget,
  setCorrection,
  workoutCorrection,
  type AdjustmentLike,
} from './adjustments.js';

const EXCHANGE = {
  id: 'food-1',
  servings: 2,
  grams: 100,
  kcal: 300,
  choG: 30,
  proteinG: 20,
  fatG: null,
};
const FOOD = { ...EXCHANGE, id: 'food-2', servings: null, grams: 150 };

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 4, 12, minutes));
const adjustment = (
  targetId: string,
  action: AdjustmentLike['action'],
  correctedValues: AdjustmentLike['correctedValues'],
  minutes = 0,
): AdjustmentLike => ({ targetId, action, correctedValues, createdAt: at(minutes) });

describe('RN-G02 · ADR-085 · corregir una comida', () => {
  it('en porciones, como se registró, con los gramos y los nutrientes en proporción; lo que no tenía dato sigue sin dato', () => {
    expect(foodCorrection(EXCHANGE, { servings: 1 })).toEqual({
      servings: 1,
      grams: 50,
      kcal: 150,
      choG: 15,
      proteinG: 10,
      fatG: null,
    });
  });

  it('en gramos si se registró en gramos', () => {
    expect(foodCorrection(FOOD, { grams: 300 })).toMatchObject({
      grams: 300,
      servings: null,
      kcal: 600,
    });
  });

  it('en otra unidad, o sin una cantidad registrada, no se corrige', () => {
    expect(foodCorrection(EXCHANGE, { grams: 80 })).toBeNull();
    expect(foodCorrection(FOOD, { servings: 1 })).toBeNull();
    expect(foodCorrection({ ...FOOD, grams: null }, { grams: 100 })).toBeNull();
  });
});

describe('RN-G02 · RN-F03 · corregir una serie o una sesión', () => {
  it('la serie: repeticiones y peso, con su tonelaje sin el calentamiento', () => {
    const set = { reps: 8, loadKg: 60, isWarmup: false };
    expect(setCorrection(set, { loadKg: 55 })).toEqual({ reps: 8, loadKg: 55, tonnageKg: 440 });
    expect(setCorrection({ ...set, isWarmup: true }, { reps: 10 })).toMatchObject({ tonnageKg: 0 });
    expect(setCorrection(set, {})).toBeNull();
  });

  it('la sesión: duración y RPE', () => {
    const workout = { durationMinutes: 50, sessionRpe: 7 };
    expect(workoutCorrection(workout, { sessionRpe: 8 })).toEqual({
      durationMinutes: 50,
      sessionRpe: 8,
    });
    expect(workoutCorrection(workout, {})).toBeNull();
  });
});

describe('RN-G02 · el día con los ajustes aplicados', () => {
  it('vale el ajuste más reciente de cada registro; los anteriores quedan como historial', () => {
    const latest = latestByTarget([
      adjustment('food-1', 'EXCLUDE', null, 1),
      adjustment('food-1', 'CORRECT', { servings: 1, kcal: 150 }, 5),
      adjustment('food-2', 'CORRECT', { grams: 300 }, 2),
    ]);

    expect(latest.get('food-1')?.action).toBe('CORRECT');
    expect(latest.size).toBe(2);
  });

  it('lo excluido no cuenta y lo corregido vale su valor nuevo; el original no cambia', () => {
    const foods = [EXCHANGE, FOOD];
    const latest = latestByTarget([
      adjustment('food-1', 'CORRECT', foodCorrection(EXCHANGE, { servings: 1 })),
      adjustment('food-2', 'EXCLUDE', null),
    ]);

    expect(adjustedFoods(foods, latest)).toEqual([
      { ...EXCHANGE, servings: 1, grams: 50, kcal: 150, choG: 15, proteinG: 10, fatG: null },
    ]);
    expect(foods[0]).toBe(EXCHANGE);
    expect(EXCHANGE.kcal).toBe(300);
  });

  it('el agua: sin lo excluido y con los ml corregidos', () => {
    const hydration = [
      { id: 'water-1', volumeMl: 250 },
      { id: 'water-2', volumeMl: 250 },
      { id: 'water-3', volumeMl: 500 },
    ];
    const latest = latestByTarget([
      adjustment('water-1', 'EXCLUDE', null),
      adjustment('water-3', 'CORRECT', { volumeMl: 300 }),
    ]);

    expect(adjustedWaterMl(hydration, latest)).toBe(550);
  });
});
