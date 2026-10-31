import {
  ONERM_BRZYCKI1993,
  ONERM_EPLEY1985,
  REVIEW_KINDS,
  ROUTINE_SPLITS,
  TRAINING_INTENSITIES,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import {
  approveBlockSchema,
  createProgramSchema,
  duplicateWeekSchema,
  ONE_RM_FORMULAS,
  REVIEW_KIND_CODES,
  ROUTINE_SPLIT_CODES,
  saveProgramWeekSchema,
  TRAINING_INTENSITY_CODES,
  updateProgramSchema,
} from './program.js';

const EXERCISE = '0192f0a0-0000-7000-8000-0000000000e1';
const setOf = (changes: object = {}) => ({ repsMin: 8, repsMax: 12, ...changes });
const weekWith = (set: object) => ({
  sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: EXERCISE, sets: [set] }] }],
});

describe('RF-26 · los códigos del programa son los del motor', () => {
  it('fórmulas de 1RM, divisiones, intensidades y revisiones', () => {
    expect(ONE_RM_FORMULAS).toEqual([ONERM_EPLEY1985.code, ONERM_BRZYCKI1993.code]);
    expect(ROUTINE_SPLIT_CODES).toEqual(ROUTINE_SPLITS);
    expect(TRAINING_INTENSITY_CODES).toEqual(TRAINING_INTENSITIES);
    expect(REVIEW_KIND_CODES).toEqual(REVIEW_KINDS);
  });
});

describe('RF-26 · lo que acepta el contrato', () => {
  it('un programa a mano: la fórmula queda por decidir y el texto vacío es null', () => {
    expect(createProgramSchema.parse({ name: ' Fuerza ', goal: ' ' })).toEqual({
      name: 'Fuerza',
      goal: null,
      startDate: null,
      oneRmFormula: null,
    });
    expect(createProgramSchema.safeParse({ name: ' ' }).success).toBe(false);
  });

  it('cambiar el encabezado pide algo que cambiar', () => {
    expect(updateProgramSchema.safeParse({}).success).toBe(false);
    expect(updateProgramSchema.safeParse({ goal: null }).success).toBe(true);
  });

  it('una serie: series de trabajo por defecto y carga, repeticiones, descanso o cardio', () => {
    const parsed = saveProgramWeekSchema.parse(weekWith(setOf()));

    expect(parsed.sessions[0]?.exercises[0]?.sets[0]).toMatchObject({
      setType: 'WORKING',
      repsMin: 8,
      repsMax: 12,
      loadKind: null,
      durationSeconds: null,
    });
    expect(saveProgramWeekSchema.safeParse(weekWith(setOf({ loadKind: 'PESO' }))).success).toBe(
      false,
    );
  });

  it('RN-D09: rechaza los decimales que las columnas no guardan', () => {
    const accepts = (set: object) => saveProgramWeekSchema.safeParse(weekWith(setOf(set))).success;

    expect(accepts({ loadKind: 'KG', loadValue: 62.5 })).toBe(true);
    expect(accepts({ loadKind: 'KG', loadValue: 62.555 })).toBe(false);
    expect(accepts({ distanceM: 1_000.5 })).toBe(true);
    expect(accepts({ distanceM: 1_000.55 })).toBe(false);
    expect(accepts({ met: 7.5 })).toBe(true);
    expect(accepts({ met: 7.55 })).toBe(false);
  });

  it('un ejercicio lleva al menos una serie, y la semana conserva lo que no llega', () => {
    expect(
      saveProgramWeekSchema.safeParse({
        sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: EXERCISE, sets: [] }] }],
      }).success,
    ).toBe(false);
    const parsed = saveProgramWeekSchema.parse({ sessions: [] });
    expect(parsed).not.toHaveProperty('phaseEs');
    expect(parsed).not.toHaveProperty('isDeload');
  });

  it('duplicar pide una semana de destino; aprobar, el día y el orden del bloque', () => {
    expect(duplicateWeekSchema.safeParse({ targetWeekIds: [] }).success).toBe(false);
    expect(approveBlockSchema.parse({ day: 1, order: 1 })).toEqual({
      day: 1,
      order: 1,
      exerciseId: null,
      note: null,
    });
  });
});
