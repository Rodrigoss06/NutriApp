import {
  BMI,
  cm,
  CONSOLIDATE_ISAK,
  kg,
  MDC95,
  runMethod,
  SITES,
  TEM_ISAK,
  WAIST_HEIGHT,
  WAIST_HIP,
  type ConsolidateInput,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import anaSeed from '../../../../seeds/ana/ana.json' with { type: 'json' };
import catalogSeed from '../../../../seeds/assessment/measurement-sites.json' with { type: 'json' };
import luisSeed from '../../../../seeds/luis/luis.json' with { type: 'json' };
import { createEnergyPrescriptionSchema } from '../nutrition/energy.js';
import { measurementSiteListResponseSchema, type MeasurementSite } from './catalog.js';
import {
  amendEvaluationSchema,
  createBiaReadingSchema,
  createEvaluationSchema,
  recordMeasurementSchema,
} from './evaluation.js';
import { recordTechnicalErrorSchema } from './technical-error.js';

/**
 * El catálogo de sitios y los casos Luis y Ana viven como datos en seeds/ (06 §1): los usan la migración del catálogo,
 * la semilla de la demo, el guion y el E2E de la Demo 1 y las pantallas mientras la API no existe. Estas pruebas los
 * atan a los contratos y al motor para que no se desalineen.
 */
const catalog = measurementSiteListResponseSchema.parse(catalogSeed);
const sites = new Map(catalog.sites.map((site) => [site.code, site]));

interface SeedEvaluation {
  kind: string;
  level: string;
  conditions: unknown;
  measurements: Record<string, number[]>;
  biaReading?: unknown;
}
interface LuisSeed {
  technicalErrorStudy: { sites: { siteCode: string; pairs: [number, number][] }[] };
  evaluations: { previous: SeedEvaluation; current: SeedEvaluation };
  energyPrescription: Record<string, unknown>;
  expected: Record<string, Record<string, unknown>>;
}
const luis = luisSeed as unknown as LuisSeed;

const familyOf = (site: MeasurementSite): ConsolidateInput['family'] =>
  site.family === 'SKINFOLD' ? 'SKINFOLD' : 'OTHER';

function consolidated(siteCode: string, attempts: number[]): number | null {
  const site = sites.get(siteCode);
  if (!site) throw new Error(`Sitio fuera del catálogo: ${siteCode}`);
  const run = runMethod(CONSOLIDATE_ISAK, { family: familyOf(site), attempts });
  if (!run.ok) throw new Error(`No consolida: ${siteCode}`);
  return run.result.outputs.value;
}

/** Los insumos del caso dorado de 03 por sitio. */
const GOLDEN_SITE_VALUES: Record<string, number> = {
  BASIC_WEIGHT: 80,
  BASIC_HEIGHT: 175,
  BASIC_SITTING_HEIGHT: 91,
  SKF_TRICEPS: 12,
  SKF_SUBSCAPULAR: 16,
  SKF_BICEPS: 6,
  SKF_ILIAC_CREST: 22,
  SKF_SUPRASPINALE: 14,
  SKF_ABDOMINAL: 25,
  SKF_FRONT_THIGH: 18,
  SKF_MEDIAL_CALF: 10,
  GIRTH_HEAD: 57,
  GIRTH_ARM_RELAXED: 33,
  GIRTH_FOREARM: 28,
  GIRTH_CHEST: 100,
  GIRTH_WAIST: 86,
  GIRTH_HIP: 98,
  GIRTH_THIGH: 55,
  GIRTH_CALF: 37,
  BREADTH_HUMERUS: 7,
  BREADTH_WRIST: 5.8,
  BREADTH_FEMUR: 9.8,
  BREADTH_BIACROMIAL: 40,
  BREADTH_BIILIOCRISTAL: 28.5,
  BREADTH_TRANSVERSE_CHEST: 30,
  BREADTH_AP_CHEST: 20,
};

const SUM6 = [
  'SKF_TRICEPS',
  'SKF_SUBSCAPULAR',
  'SKF_SUPRASPINALE',
  'SKF_ABDOMINAL',
  'SKF_FRONT_THIGH',
  'SKF_MEDIAL_CALF',
];

describe('RN-C01 · catálogo de sitios (seeds/assessment/measurement-sites.json)', () => {
  it('ISAK 2 exige 42 sitios (⚠️ falta el noveno diámetro), ISAK 1 los 21 del perfil restringido y el básico 4', () => {
    const at = (level: string) =>
      catalog.sites.filter((site) => site.levels.includes(level as never));
    expect(at('ISAK2')).toHaveLength(42);
    expect(at('ISAK1')).toHaveLength(21);
    expect(at('BASIC').map(({ code }) => code)).toEqual([
      'BASIC_WEIGHT',
      'BASIC_HEIGHT',
      'GIRTH_WAIST',
      'GIRTH_HIP',
    ]);
    expect(at('ISAK1').every((site) => site.levels.includes('ISAK2'))).toBe(true);
  });

  it('RN-D04 · reutiliza los códigos del motor (ADR-023) y suma los 3 sitios extra de Jackson y Pollock', () => {
    for (const code of Object.values(SITES)) expect(sites.has(code), code).toBe(true);
    expect(
      catalog.sites.filter((site) => site.levels.length === 0).map(({ code }) => code),
    ).toEqual(['SKF_CHEST', 'SKF_MIDAXILLARY', 'SKF_SUPRAILIAC']);
  });

  it('RN-C02 · RN-C04 · pliegues de 0 a 80 mm con 5 %; peso y talla con los rangos de 03; el resto con 1 %', () => {
    for (const site of catalog.sites) {
      expect(site.tolerancePct, site.code).toBe(site.family === 'SKINFOLD' ? 5 : 1);
      expect(site.minValue, site.code).toBeLessThan(site.maxValue);
      if (site.family === 'SKINFOLD') expect([site.minValue, site.maxValue]).toEqual([0, 80]);
    }
    expect(sites.get('BASIC_WEIGHT')).toMatchObject({ minValue: 20, maxValue: 300, unit: 'kg' });
    expect(sites.get('BASIC_HEIGHT')).toMatchObject({ minValue: 100, maxValue: 230, unit: 'cm' });
    const orders = catalog.sites.map(({ displayOrder }) => displayOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('Caso Luis (seeds/luis/luis.json)', () => {
  const { previous, current } = luis.evaluations;

  it('las dos evaluaciones son ISAK 2 completas, válidas para los contratos y sin tercera toma pendiente', () => {
    const isak2 = catalog.sites
      .filter((site) => site.levels.includes('ISAK2'))
      .map(({ code }) => code);
    for (const evaluation of [previous, current]) {
      expect(
        createEvaluationSchema.safeParse({
          kind: evaluation.kind,
          level: evaluation.level,
          measuredAt: '2026-10-13T13:30:00.000Z',
          conditions: evaluation.conditions,
        }).success,
      ).toBe(true);
      expect(Object.keys(evaluation.measurements).sort()).toEqual([...isak2].sort());
      for (const [siteCode, attempts] of Object.entries(evaluation.measurements)) {
        const site = sites.get(siteCode) as MeasurementSite;
        expect(recordMeasurementSchema.safeParse({ attempts }).success, siteCode).toBe(true);
        for (const value of attempts) {
          expect(value, siteCode).toBeGreaterThanOrEqual(site.minValue);
          expect(value, siteCode).toBeLessThanOrEqual(site.maxValue);
        }
        expect(consolidated(siteCode, attempts), siteCode).not.toBeNull();
      }
    }
  });

  it('G-05 a G-11 · los consolidados de la evaluación actual son los insumos del caso dorado de 03', () => {
    for (const [siteCode, value] of Object.entries(GOLDEN_SITE_VALUES)) {
      const attempts = current.measurements[siteCode] ?? [];
      expect(consolidated(siteCode, attempts), siteCode).toBeCloseTo(value, 9);
    }
  });

  it('G-04 · el estudio de ETM del evaluador da 0.374 mm (2.35 %), CMD95 1.04 mm y 6.18 mm sobre la suma de 6', () => {
    const study = recordTechnicalErrorSchema.parse({
      source: 'CALCULATED',
      validFrom: '2026-07-15',
      sites: luis.technicalErrorStudy.sites,
    });
    expect(study.sites.map(({ siteCode }) => siteCode).sort()).toEqual([...SUM6].sort());
    const tem = runMethod(TEM_ISAK, {
      pairs: luis.technicalErrorStudy.sites.flatMap((s) => s.pairs),
    });
    if (!tem.ok) throw new Error('TEM_ISAK falló');
    expect(tem.result.outputs.temAbs).toBeCloseTo(0.374, 3);
    expect(tem.result.outputs.temRelPct).toBeCloseTo(2.35, 2);
    const mdc = (error: number) => {
      const run = runMethod(MDC95, { measurementError: error });
      if (!run.ok) throw new Error('MDC95 falló');
      return run.result.outputs.mdc95;
    };
    expect(mdc(tem.result.outputs.temAbs)).toBeCloseTo(1.04, 2);
    const sum6 = SUM6.reduce((total, code) => total + (GOLDEN_SITE_VALUES[code] ?? Number.NaN), 0);
    expect(sum6).toBe(95);
    expect(mdc((tem.result.outputs.temRelPct / 100) * sum6)).toBeCloseTo(6.18, 2);
  });

  it('RN-C06 · frente a la evaluación anterior hay cambios por encima y por debajo del CMD95', () => {
    const delta = (code: string) =>
      (consolidated(code, current.measurements[code] ?? []) ?? 0) -
      (consolidated(code, previous.measurements[code] ?? []) ?? 0);
    const mdcOf = (code: string) => {
      const pairs = luis.technicalErrorStudy.sites.find((site) => site.siteCode === code)?.pairs;
      const tem = runMethod(TEM_ISAK, { pairs: pairs ?? [] });
      if (!tem.ok) throw new Error(code);
      return 1.96 * Math.SQRT2 * tem.result.outputs.temAbs;
    };
    const significant = SUM6.filter((code) => Math.abs(delta(code)) > mdcOf(code));
    expect(significant.sort()).toEqual(['SKF_SUBSCAPULAR', 'SKF_SUPRASPINALE', 'SKF_TRICEPS']);
    const sumDelta = SUM6.reduce((total, code) => total + delta(code), 0);
    expect(Math.abs(sumDelta)).toBeGreaterThan(6.18);
  });

  it('RN-C08 · la actual es mixta: su lectura de bioimpedancia cumple el contrato, con marca y modelo', () => {
    expect(current.kind).toBe('MIXED');
    expect(previous.kind).toBe('ANTHROPOMETRY');
    const reading = createBiaReadingSchema.parse(current.biaReading);
    expect(reading.deviceBrand).toBeTruthy();
    expect(reading.deviceModel).toBeTruthy();
  });

  it('la prescripción de la demo cumple su contrato (G-13 a G-17)', () => {
    expect(
      createEnergyPrescriptionSchema.safeParse({
        ...luis.energyPrescription,
        evaluationId: '01920000-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true);
  });
});

interface AnaSeed {
  liveCapture: SeedEvaluation & {
    extraSite: { siteCode: string; steps: { goldenCase: string; attempts: number[] }[] };
    amendment: { reason: string; measurements: Record<string, number[]> };
  };
  expected: {
    original: Record<string, number>;
    amended: Record<string, number>;
  };
}
const ana = anaSeed as unknown as AnaSeed;

describe('Caso Ana (seeds/ana/ana.json): la captura en vivo de la Demo 1', () => {
  const capture = ana.liveCapture;
  const value = (code: string, measurements = capture.measurements) =>
    consolidated(code, measurements[code] ?? []) ?? Number.NaN;

  it('RN-C01 · evaluación básica con sus 4 sitios, válida para los contratos y sin tercera toma pendiente', () => {
    expect(
      createEvaluationSchema.safeParse({
        kind: capture.kind,
        level: capture.level,
        measuredAt: '2026-10-13T15:00:00.000Z',
        conditions: capture.conditions,
      }).success,
    ).toBe(true);
    expect(Object.keys(capture.measurements)).toEqual([
      'BASIC_WEIGHT',
      'BASIC_HEIGHT',
      'GIRTH_WAIST',
      'GIRTH_HIP',
    ]);
    for (const [siteCode, attempts] of Object.entries(capture.measurements)) {
      expect(recordMeasurementSchema.safeParse({ attempts }).success, siteCode).toBe(true);
      expect(consolidated(siteCode, attempts), siteCode).not.toBeNull();
    }
  });

  it('G-01 a G-03 · el pliegue de tríceps extra: 3.33 % y 12.2 mm; 8.33 % pide tercera; mediana 12.6 mm', () => {
    const run = (attempts: number[]) => {
      const result = runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts });
      if (!result.ok) throw new Error(attempts.join(' '));
      return result.result.outputs;
    };
    const [g01, g02, g03] = capture.extraSite.steps;
    expect(capture.extraSite.siteCode).toBe('SKF_TRICEPS');
    expect(capture.extraSite.steps.map((step) => step.goldenCase)).toEqual([
      'G-01',
      'G-02',
      'G-03',
    ]);
    expect(run(g01?.attempts ?? [])).toMatchObject({ value: 12.2, needsThird: false });
    expect(run(g01?.attempts ?? []).diffPct).toBeCloseTo(3.33, 2);
    expect(run(g02?.attempts ?? [])).toMatchObject({ value: null, needsThird: true });
    expect(run(g02?.attempts ?? []).diffPct).toBeCloseTo(8.33, 2);
    expect(run(g03?.attempts ?? [])).toMatchObject({ value: 12.6, consolidation: 'MEDIAN_3' });
  });

  it('RN-C07 · la enmienda corrige el peso con un motivo válido', () => {
    expect(amendEvaluationSchema.safeParse({ reason: capture.amendment.reason }).success).toBe(
      true,
    );
    expect(Object.keys(capture.amendment.measurements)).toEqual(['BASIC_WEIGHT']);
    expect(value('BASIC_WEIGHT', capture.amendment.measurements)).toBe(
      ana.expected.amended.weightKg,
    );
  });

  it('G-05 en Ana · IMC, cintura/talla y cintura/cadera del motor, antes y después de la enmienda', () => {
    const { original, amended } = ana.expected;
    const height = value('BASIC_HEIGHT');
    expect(value('BASIC_WEIGHT')).toBe(original.weightKg);
    expect(height).toBeCloseTo(original.heightCm ?? Number.NaN, 9);
    expect(value('GIRTH_WAIST')).toBeCloseTo(original.waistCm ?? Number.NaN, 9);
    expect(value('GIRTH_HIP')).toBeCloseTo(original.hipCm ?? Number.NaN, 9);
    const bmi = (weight: number) => {
      const run = runMethod(BMI, { weightKg: kg(weight), heightCm: cm(height) });
      if (!run.ok) throw new Error('BMI');
      return run.result.outputs.bmi;
    };
    expect(bmi(value('BASIC_WEIGHT'))).toBeCloseTo(original.bmi ?? Number.NaN, 2);
    expect(bmi(amended.weightKg ?? Number.NaN)).toBeCloseTo(amended.bmi ?? Number.NaN, 2);
    const waistHeight = runMethod(WAIST_HEIGHT, {
      waistCm: cm(value('GIRTH_WAIST')),
      heightCm: cm(height),
    });
    const waistHip = runMethod(WAIST_HIP, {
      waistCm: cm(value('GIRTH_WAIST')),
      hipCm: cm(value('GIRTH_HIP')),
    });
    if (!waistHeight.ok || !waistHip.ok) throw new Error('índices de cintura');
    expect(waistHeight.result.outputs.ratio).toBeCloseTo(
      original.waistHeightRatio ?? Number.NaN,
      4,
    );
    expect(waistHip.result.outputs.ratio).toBeCloseTo(original.waistHipRatio ?? Number.NaN, 4);
  });
});
