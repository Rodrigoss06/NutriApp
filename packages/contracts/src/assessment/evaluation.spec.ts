import { describe, expect, it } from 'vitest';
import { createEnergyPrescriptionSchema } from '../nutrition/energy.js';
import {
  createBiaReadingSchema,
  createEvaluationSchema,
  recordMeasurementSchema,
} from './evaluation.js';
import { recordTechnicalErrorSchema } from './technical-error.js';

const conditions = { schemaVersion: 1, fasting: true, intenseActivityLast24h: false };
const at = '2026-10-13T13:30:00.000Z';

describe('RN-C01 · nivel según el tipo de evaluación', () => {
  it('antropométrica o mixta lleva nivel; bioimpedancia, no', () => {
    expect(
      createEvaluationSchema.safeParse({ level: 'ISAK2', measuredAt: at, conditions }).success,
    ).toBe(true);
    expect(createEvaluationSchema.safeParse({ measuredAt: at, conditions }).success).toBe(false);
    expect(
      createEvaluationSchema.safeParse({ kind: 'BIA', measuredAt: at, conditions }).success,
    ).toBe(true);
    expect(
      createEvaluationSchema.safeParse({ kind: 'BIA', level: 'BASIC', measuredAt: at, conditions })
        .success,
    ).toBe(false);
  });

  it('RN-C09 · las condiciones v1 son estrictas y la hidratación es opcional', () => {
    const parsed = createEvaluationSchema.parse({ level: 'BASIC', measuredAt: at, conditions });
    expect(parsed.conditions.hydration).toBeNull();
    expect(
      createEvaluationSchema.safeParse({
        level: 'BASIC',
        measuredAt: at,
        conditions: { ...conditions, otra: 1 },
      }).success,
    ).toBe(false);
  });
});

describe('RN-C02 · tomas por sitio', () => {
  it('de una a tres tomas, con hasta 2 decimales', () => {
    expect(recordMeasurementSchema.safeParse({ attempts: [12.35] }).success).toBe(true);
    expect(recordMeasurementSchema.safeParse({ attempts: [12.0, 13.0, 12.6] }).success).toBe(true);
    expect(recordMeasurementSchema.safeParse({ attempts: [] }).success).toBe(false);
    expect(recordMeasurementSchema.safeParse({ attempts: [1, 2, 3, 4] }).success).toBe(false);
    expect(recordMeasurementSchema.safeParse({ attempts: [12.345] }).success).toBe(false);
  });
});

describe('RN-C08 · bioimpedancia con lista cerrada y la unidad de cada equipo', () => {
  const reading = (metric: string, unit: string, value = 10) => ({
    deviceBrand: 'Marca',
    deviceModel: 'Modelo',
    readings: [{ metric, unit, value, deviceLabel: 'Nombre en el equipo' }],
  });

  it('el agua acepta kg, L o %; la grasa visceral, nivel o cm²; el ángulo de fase, grados', () => {
    for (const [metric, unit] of [
      ['TOTAL_BODY_WATER', 'L'],
      ['TOTAL_BODY_WATER', '%'],
      ['VISCERAL_FAT', 'level'],
      ['VISCERAL_FAT', 'cm2'],
      ['PHASE_ANGLE', 'deg'],
    ] as const) {
      expect(
        createBiaReadingSchema.safeParse(reading(metric, unit)).success,
        `${metric} ${unit}`,
      ).toBe(true);
    }
    expect(createBiaReadingSchema.safeParse(reading('MUSCLE_MASS', '%')).success).toBe(false);
    expect(createBiaReadingSchema.safeParse(reading('FAT_PCT', '%', 120)).success).toBe(false);
  });

  it('cada indicador va una sola vez y lleva el nombre que usa el equipo', () => {
    const value = { metric: 'FAT_PCT', unit: '%', value: 10, deviceLabel: 'Grasa corporal' };
    const twice = { ...reading('FAT_PCT', '%'), readings: [value, value] };
    expect(createBiaReadingSchema.safeParse(twice).success).toBe(false);
    const nameless = { ...reading('FAT_PCT', '%'), readings: [{ ...value, deviceLabel: ' ' }] };
    expect(createBiaReadingSchema.safeParse(nameless).success).toBe(false);
  });
});

describe('RN-C05 · ETM calculado o declarado', () => {
  it('un sitio no se repite en el mismo registro', () => {
    const site = { siteCode: 'SKF_TRICEPS', pairs: [[12.0, 12.4]] };
    expect(
      recordTechnicalErrorSchema.safeParse({
        source: 'CALCULATED',
        validFrom: '2026-07-15',
        sites: [site],
      }).success,
    ).toBe(true);
    expect(
      recordTechnicalErrorSchema.safeParse({
        source: 'CALCULATED',
        validFrom: '2026-07-15',
        sites: [site, site],
      }).success,
    ).toBe(false);
    expect(
      recordTechnicalErrorSchema.safeParse({
        source: 'DECLARED',
        validFrom: '2026-07-15',
        sites: [{ siteCode: 'SKF_TRICEPS', temAbs: 0.3, temRelPct: 2.4 }],
      }).success,
    ).toBe(true);
  });
});

describe('RN-E02 · prescripción energética', () => {
  const base = {
    evaluationId: '01920000-0000-7000-8000-000000000001',
    rmrMethodCode: 'RMR_MIFFLIN1990',
    pal: 1.4,
    goal: 'LOSE_FAT',
    adjustment: { kind: 'FAT_KG_PER_MONTH', fatKgPerMonth: -3 },
    proteinGPerKg: 2,
    fatPctKcal: 25,
  };
  const running = [{ activityCode: '12050', minutesPerSession: 30, sessionsPerWeek: 3 }];

  it('PAL de 1.40 a 2.40, aditiva por defecto', () => {
    expect(createEnergyPrescriptionSchema.parse(base).strategy).toBe('ADDITIVE');
    expect(createEnergyPrescriptionSchema.safeParse({ ...base, pal: 1.39 }).success).toBe(false);
    expect(createEnergyPrescriptionSchema.safeParse({ ...base, pal: 2.41 }).success).toBe(false);
  });

  it('con la estrategia factorial no se suman actividades (ADR-016)', () => {
    expect(createEnergyPrescriptionSchema.safeParse({ ...base, activities: running }).success).toBe(
      true,
    );
    expect(
      createEnergyPrescriptionSchema.safeParse({
        ...base,
        strategy: 'FACTORIAL',
        activities: running,
      }).success,
    ).toBe(false);
  });
});
