import { describe, expect, it } from 'vitest';
import { adjustRecordSchema, markAppNotesReadSchema } from './adjustments.js';

const TARGET = '0193a000-0000-7000-8000-000000000001';
const base = {
  targetId: TARGET,
  targetLocalDate: '2026-11-04',
  reason: 'Lo registró dos veces por error.',
};
const accepts = (input: object) => adjustRecordSchema.safeParse({ ...base, ...input }).success;

describe('RN-G02 · el ajuste del profesional', () => {
  it('pide un motivo de 10 caracteres o más', () => {
    expect(accepts({ targetType: 'HYDRATION', action: 'EXCLUDE', reason: 'Duplicado' })).toBe(
      false,
    );
    expect(accepts({ targetType: 'HYDRATION', action: 'EXCLUDE' })).toBe(true);
  });

  it('excluir no lleva valores; cualquier registro se puede excluir', () => {
    for (const targetType of ['FOOD', 'HYDRATION', 'WORKOUT', 'SET', 'CHECKIN', 'METRIC']) {
      expect(accepts({ targetType, action: 'EXCLUDE' })).toBe(true);
    }
    expect(
      accepts({ targetType: 'HYDRATION', action: 'EXCLUDE', correctedValues: { volumeMl: 500 } }),
    ).toBe(false);
  });

  it('ADR-085: corregir solo lo de cada tipo; el registro diario solo se excluye', () => {
    expect(
      accepts({ targetType: 'HYDRATION', action: 'CORRECT', correctedValues: { volumeMl: 500 } }),
    ).toBe(true);
    expect(
      accepts({ targetType: 'HYDRATION', action: 'CORRECT', correctedValues: { reps: 8 } }),
    ).toBe(false);
    expect(
      accepts({ targetType: 'SET', action: 'CORRECT', correctedValues: { reps: 8, loadKg: 62.5 } }),
    ).toBe(true);
    expect(
      accepts({ targetType: 'WORKOUT', action: 'CORRECT', correctedValues: { sessionRpe: 7.5 } }),
    ).toBe(true);
    expect(
      accepts({ targetType: 'METRIC', action: 'CORRECT', correctedValues: { value: 79.4 } }),
    ).toBe(true);
    expect(
      accepts({ targetType: 'CHECKIN', action: 'CORRECT', correctedValues: { volumeMl: 1 } }),
    ).toBe(false);
    expect(accepts({ targetType: 'FOOD', action: 'CORRECT', correctedValues: {} })).toBe(false);
  });

  it('una comida se corrige en gramos o en porciones, no las dos', () => {
    expect(
      accepts({ targetType: 'FOOD', action: 'CORRECT', correctedValues: { grams: 150 } }),
    ).toBe(true);
    expect(
      accepts({ targetType: 'FOOD', action: 'CORRECT', correctedValues: { servings: 1.5 } }),
    ).toBe(true);
    expect(
      accepts({
        targetType: 'FOOD',
        action: 'CORRECT',
        correctedValues: { grams: 150, servings: 1 },
      }),
    ).toBe(false);
  });

  it('RN-D09: más decimales de los que se guardan se rechazan', () => {
    expect(
      accepts({ targetType: 'SET', action: 'CORRECT', correctedValues: { loadKg: 62.555 } }),
    ).toBe(false);
  });
});

describe('RN-G13 · las notas que el profesional abrió', () => {
  it('de 1 a 100 notas por vez', () => {
    expect(markAppNotesReadSchema.safeParse({ noteIds: [TARGET] }).success).toBe(true);
    expect(markAppNotesReadSchema.safeParse({ noteIds: [] }).success).toBe(false);
  });
});
