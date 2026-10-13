import { FAT_DW1974_SIRI1961, kg, mm, runMethod } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import luisSeed from '../../../../../../seeds/luis/luis.json' with { type: 'json' };
import type { BodyCompositionInput } from '../domain/energy-rules.js';
import {
  calculatePrescription,
  rmrOptions,
  type CatalogActivity,
  type PrescriptionCalculation,
  type PrescriptionRequest,
} from './energy-calculation.js';

/** La masa libre de grasa de Luis con su método principal (Durnin & Womersley + Siri, G-06). */
function luisBasis(): BodyCompositionInput {
  const dw = runMethod(FAT_DW1974_SIRI1961, {
    sex: 'M',
    ageYears: 28,
    population: 'ADULT',
    weightKg: kg(80),
    skinfoldsMm: { triceps: mm(12), biceps: mm(6), subscapular: mm(16), iliacCrest: mm(22) },
  });
  if (!dw.ok) throw new Error('DW');
  return {
    evaluationId: '01920000-0000-7000-8000-0000000000e2',
    sex: 'M',
    ageYears: 28,
    weightKg: 80,
    heightCm: 175,
    fatFreeMass: {
      kg: dw.result.outputs.fatFreeMassKg,
      methodCode: 'FAT_DW1974_SIRI1961',
      calculationResultId: '01920000-0000-7000-8000-0000000000f1',
    },
  };
}

const CATALOG = new Map<string, CatalogActivity>([
  ['12050', { code: '12050', descriptionEs: 'Correr a 6–6.3 mph (unos 10 km/h)', met: 9.3 }],
]);
const REQUEST = luisSeed.energyPrescription as unknown as PrescriptionRequest;

function prescribed(request: PrescriptionRequest = REQUEST): PrescriptionCalculation {
  const result = calculatePrescription(luisBasis(), request, CATALOG, '2026-10-13');
  if (!result.ok) throw new Error(JSON.stringify(result.failure));
  return result.value;
}
const out = (component: { outputs: Readonly<Record<string, unknown>> }, key: string) =>
  component.outputs[key] as number;

describe('Casos dorados de energía con la composición de Luis', () => {
  it('G-13 · TMR con los cinco métodos: Mifflin 1759, Harris-Benedict 1853, FAO 1897, Cunningham 1903, Katch 1748', () => {
    const options = new Map(rmrOptions(luisBasis()).map((o) => [o.methodCode, o.rmrKcal]));
    const expected = luisSeed.expected['G-13'] as Record<string, number>;
    for (const [methodCode, kcal] of Object.entries(expected)) {
      expect(options.get(methodCode as never), methodCode).toBeCloseTo(kcal, -0.3);
    }
  });

  it('RN-E01 · sin masa libre de grasa, Cunningham y Katch-McArdle no se calculan y lo dicen', () => {
    const options = rmrOptions({ ...luisBasis(), fatFreeMass: null });
    expect(options.find((o) => o.methodCode === 'RMR_CUNNINGHAM1980')).toMatchObject({
      rmrKcal: null,
      issues: [expect.objectContaining({ code: 'NC-ENG-203' })],
    });
  });

  it('G-14 y G-15 · PAL 1.4: 2462 kcal; correr 3 veces 30 min: bruto 372, neto 332 por sesión, 142 por día, GET 2605', () => {
    const { components } = prescribed();
    expect(out(components.tee, 'baseKcal')).toBeCloseTo(2462, -0.3);
    const [running] = components.exercise.outputs.activities as {
      grossKcalPerSession: number;
      netKcalPerSession: number;
    }[];
    expect(running?.grossKcalPerSession).toBeCloseTo(372, -0.3);
    expect(running?.netKcalPerSession).toBeCloseTo(332, -0.3);
    expect(out(components.exercise, 'dailyAverageNetKcal')).toBeCloseTo(142, -0.3);
    expect(out(components.tee, 'teeKcal')).toBeCloseTo(2605, -0.3);
    expect(components.tee.methodCode).toBe('TEE_PAL');
  });

  it('G-16 · −3 kg de grasa al mes: déficit 770, objetivo 1835 kcal, ritmo 0.86 % semanal y 1.65 meses', () => {
    const { components } = prescribed();
    expect(out(components.adjustment, 'deficitKcal')).toBeCloseTo(770, -0.3);
    expect(out(components.adjustment, 'targetKcal')).toBeCloseTo(1835, -0.3);
    expect(out(components.adjustment, 'weeklyRatePct')).toBeCloseTo(0.86, 2);
    expect(components.projection && out(components.projection, 'monthsToTarget')).toBeCloseTo(
      1.65,
      2,
    );
  });

  it('G-12 · peso objetivo 75.05 kg y fecha estimada a 1.6495 meses × 30 = 49 días (RN-E05, estimación inicial)', () => {
    const { components } = prescribed();
    expect(components.projection && out(components.projection, 'targetWeightKg')).toBeCloseTo(
      75.05,
      2,
    );
    expect(components.projection?.estimatedDate).toBe('2026-12-01');
  });

  it('G-17 · 2 g/kg y 25 % de grasa: proteína 160 g, grasa 51 g y carbohidratos 184 g (RN-E07)', () => {
    const { components } = prescribed();
    expect(out(components.macros, 'proteinG')).toBeCloseTo(160, -0.3);
    expect(out(components.macros, 'fatG')).toBeCloseTo(51, -0.3);
    expect(out(components.macros, 'choG')).toBeCloseTo(184, -0.3);
  });

  it('RN-E02 · factorial: el ejercicio no se suma; RN-E04 · el ajuste en kcal da su ritmo semanal', () => {
    const factorial = prescribed({ ...REQUEST, strategy: 'FACTORIAL', activities: [] });
    expect(out(factorial.components.tee, 'exerciseKcal')).toBe(0);
    const kcal = prescribed({ ...REQUEST, adjustment: { kind: 'KCAL_PER_DAY', kcalPerDay: -770 } });
    expect(kcal.fatKgPerMonth).toBeCloseTo(-3, 9);
    expect(out(kcal.components.adjustment, 'weeklyRatePct')).toBeCloseTo(0.86, 2);
  });

  it('RN-E07 · si los carbohidratos salen negativos, no se puede guardar', () => {
    const result = calculatePrescription(
      luisBasis(),
      { ...REQUEST, proteinGPerKg: 4, fatPctKcal: 45 },
      CATALOG,
      '2026-10-13',
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toMatchObject({
      kind: 'RULE',
      methodCode: 'MACROS_PROTEIN_FIRST',
      issue: { code: 'NC-ENG-302', rule: 'RN-E07' },
    });
  });

  it('RN-E06 · el peso objetivo necesita la masa libre de grasa', () => {
    const result = calculatePrescription(
      { ...luisBasis(), fatFreeMass: null },
      REQUEST,
      CATALOG,
      '2026-10-13',
    );
    expect(!result.ok && result.failure).toEqual({ kind: 'NO_FAT_FREE_MASS' });
  });

  it('RN-D01 · mismos insumos, mismo hash; cada componente cita su método', () => {
    const first = prescribed();
    expect(prescribed().inputsHash).toBe(first.inputsHash);
    const { rmr, exercise, tee, adjustment, projection, macros } = first.components;
    expect([rmr, exercise, tee, adjustment, projection, macros].map((c) => c?.methodCode)).toEqual([
      'RMR_MIFFLIN1990',
      'EE_MET_COMPENDIUM2024',
      'TEE_PAL',
      'FAT_LOSS_7700',
      'TARGET_WEIGHT_FAT_PCT',
      'MACROS_PROTEIN_FIRST',
    ]);
  });
});
