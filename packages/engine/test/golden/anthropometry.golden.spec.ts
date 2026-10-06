import { describe, expect, it } from 'vitest';
import {
  BMI,
  CONSOLIDATE_ISAK,
  MDC95,
  TEM_ISAK,
  WAIST_HEIGHT,
  WAIST_HIP,
} from '../../src/anthropometry/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { LUIS, LUIS_SKINFOLD_PAIRS } from '../fixtures/luis.js';
import { expectOk } from '../support.js';

describe('G-01 · RN-C02 y RN-C03 · dos tomas dentro de la tolerancia', () => {
  it('diferencia 3.33 %, sin tercera toma, consolidado 12.2 mm', () => {
    const { outputs } = expectOk(
      runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [12.0, 12.4] }),
    );

    expect(outputs.diffPct).toBeCloseTo(3.33, 2);
    expect(outputs.needsThird).toBe(false);
    expect(outputs.value).toBeCloseTo(12.2, 2);
  });
});

describe('G-02 · RN-C02 · dos tomas fuera de la tolerancia', () => {
  it('diferencia 8.33 %, pide tercera toma', () => {
    const { outputs } = expectOk(
      runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [12.0, 13.0] }),
    );

    expect(outputs.diffPct).toBeCloseTo(8.33, 2);
    expect(outputs.needsThird).toBe(true);
    expect(outputs.value).toBeNull();
  });
});

describe('G-03 · RN-C03 · tres tomas', () => {
  it('mediana 12.6 mm', () => {
    const { outputs } = expectOk(
      runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [12.0, 13.0, 12.6] }),
    );

    expect(outputs.value).toBeCloseTo(12.6, 2);
    expect(outputs.consolidation).toBe('MEDIAN_3');
  });
});

describe('G-04 · RN-C05 · ETM y CMD95', () => {
  it('ETM 0.374 mm (2.35 %) y CMD95 1.04 mm', () => {
    const tem = expectOk(runMethod(TEM_ISAK, { pairs: LUIS_SKINFOLD_PAIRS })).outputs;
    const mdc = expectOk(runMethod(MDC95, { measurementError: tem.temAbs })).outputs;

    expect(tem.temAbs).toBeCloseTo(0.374, 3);
    expect(tem.temRelPct).toBeCloseTo(2.35, 2);
    expect(mdc.mdc95).toBeCloseTo(1.04, 2);
  });

  it('sobre la suma de 6 pliegues (95 mm): CMD95 6.18 mm, sin redondear el %ETM (RN-D09)', () => {
    const tem = expectOk(runMethod(TEM_ISAK, { pairs: LUIS_SKINFOLD_PAIRS })).outputs;
    const sum6Mm = 12 + 16 + 14 + 25 + 18 + 10;
    const errorOfSumMm = (tem.temRelPct / 100) * sum6Mm;

    expect(sum6Mm).toBe(95);
    expect(
      expectOk(runMethod(MDC95, { measurementError: errorOfSumMm })).outputs.mdc95,
    ).toBeCloseTo(6.18, 2);
  });
});

describe('G-05 · RN-D10 · indicadores simples', () => {
  it('IMC 26.12; cintura/talla 0.491; cintura/cadera 0.88', () => {
    const bmi = expectOk(
      runMethod(BMI, { weightKg: LUIS.weightKg, heightCm: LUIS.heightCm }),
    ).outputs;
    const waistHeight = expectOk(
      runMethod(WAIST_HEIGHT, { waistCm: LUIS.girthsCm.waist, heightCm: LUIS.heightCm }),
    ).outputs;
    const waistHip = expectOk(
      runMethod(WAIST_HIP, { waistCm: LUIS.girthsCm.waist, hipCm: LUIS.girthsCm.hip }),
    ).outputs;

    expect(bmi.bmi).toBeCloseTo(26.12, 2);
    expect(waistHeight.ratio).toBeCloseTo(0.491, 3);
    expect(waistHip.ratio).toBeCloseTo(0.88, 2);
  });
});
