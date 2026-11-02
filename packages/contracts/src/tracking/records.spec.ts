import { describe, expect, it } from 'vitest';
import {
  correctFoodLogSchema,
  logFoodSchema,
  logHydrationSchema,
  logMetricSchema,
  logNoteSchema,
} from './records.js';

const CLIENT = '0193a000-0000-7000-8000-000000000001';
const MEAL = '0193a000-0000-7000-8000-000000000002';
const FOOD = '0193a000-0000-7000-8000-000000000003';

describe('RN-G05 · RN-G06 · RN-G08 · registrar una comida', () => {
  it('desde el plan, sin porciones: la del plan por defecto', () => {
    const parsed = logFoodSchema.parse({
      clientId: CLIENT,
      localDate: '2026-11-01',
      source: { kind: 'EXCHANGE', mealId: MEAL, groupCode: 'STA', foodId: FOOD },
    });
    expect(parsed.source).toMatchObject({ kind: 'EXCHANGE', servings: null });
  });

  it('pide el clientId del celular y una fecha', () => {
    expect(
      logFoodSchema.safeParse({
        localDate: '2026-11-01',
        source: { kind: 'MENU', mealId: MEAL, option: 'A' },
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '1/11/2026',
        source: { kind: 'MENU', mealId: MEAL, option: 'A' },
      }).success,
    ).toBe(false);
  });

  it('fuera del plan, del catálogo, con su tiempo y sus gramos; más decimales de los que se guardan se rechazan (RN-D09)', () => {
    const catalog = { kind: 'CATALOG', mealSlotCode: 'AFTERNOON', foodId: FOOD, grams: 120 };
    expect(
      logFoodSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', source: catalog })
        .success,
    ).toBe(true);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        source: { ...catalog, grams: 120.555 },
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        source: { ...catalog, mealSlotCode: 'SNACK' },
      }).success,
    ).toBe(false);
  });

  it('RN-G12: corregir lleva un clientId nuevo y lo que reemplaza, sin fecha (es la del registro)', () => {
    expect(
      correctFoodLogSchema.safeParse({
        clientId: CLIENT,
        source: { kind: 'FOOD', mealId: MEAL, foodId: FOOD, grams: 30 },
      }).success,
    ).toBe(true);
  });
});

describe('agua, notas y peso', () => {
  it('el agua va de 1 a 5 000 ml, en enteros', () => {
    const water = (volumeMl: number) =>
      logHydrationSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', volumeMl }).success;
    expect(water(250)).toBe(true);
    expect(water(0)).toBe(false);
    expect(water(5001)).toBe(false);
    expect(water(250.5)).toBe(false);
  });

  it('una nota tiene texto, hasta 2 000 caracteres', () => {
    const note = (body: string) =>
      logNoteSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', body }).success;
    expect(note('Me costó la cena.')).toBe(true);
    expect(note('   ')).toBe(false);
    expect(note('a'.repeat(2001))).toBe(false);
  });

  it('RN-C04: el peso va de 20 a 300 kg', () => {
    const weight = (value: number) =>
      logMetricSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        metricCode: 'BODY_WEIGHT',
        value,
      }).success;
    expect(weight(72.4)).toBe(true);
    expect(weight(19.9)).toBe(false);
    expect(weight(301)).toBe(false);
  });
});
