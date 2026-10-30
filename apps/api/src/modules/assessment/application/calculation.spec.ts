import { describe, expect, it } from 'vitest';
import luisSeed from '../../../../../../seeds/luis/luis.json' with { type: 'json' };
import { SITES } from './assessment-fakes.spec-support.js';
import { calculateEvaluation, type CalculationOutcome } from './calculation.js';
import { consolidate } from './data-quality.js';
import { metricsOf } from './result-metrics.js';

const bySite = new Map(SITES.map((site) => [site.code, site]));

function consolidated(measurements: Record<string, number[]>): Map<string, number> {
  const values = new Map<string, number>();
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    const site = bySite.get(siteCode);
    const value = site ? consolidate(site, attempts).value : null;
    if (value !== null) values.set(siteCode, value);
  }
  return values;
}

const luis = (overrides: { coefficient?: number | null } = {}): CalculationOutcome =>
  calculateEvaluation({
    level: 'ISAK2',
    subject: { sex: 'M', ageYears: 28, population: 'ADULT' },
    values: consolidated(luisSeed.evaluations.current.measurements),
    preferenceRows: [],
    referenceGroupCoefficient: overrides.coefficient === undefined ? 0 : overrides.coefficient,
  });

const metric = (outcome: CalculationOutcome, methodCode: string, metricCode: string) => {
  const result = outcome.results.find((r) => r.methodCode === methodCode);
  if (!result) throw new Error(`Sin resultado de ${methodCode}`);
  const found = metricsOf(methodCode, result.outputs, result.inputs).find(
    (m) => m.metricCode === metricCode,
  );
  if (!found) throw new Error(`Sin ${metricCode} en ${methodCode}`);
  return found;
};
const value = (outcome: CalculationOutcome, methodCode: string, metricCode: string) =>
  metric(outcome, methodCode, metricCode).value;

describe('Casos dorados de punta a punta: los 42 sitios de Luis, consolidados y calculados', () => {
  const outcome = luis();

  it('G-05 · IMC 26.12; cintura/talla 0.491; cintura/cadera 0.88', () => {
    expect(value(outcome, 'BMI', 'BMI')).toBeCloseTo(26.12, 2);
    expect(value(outcome, 'WAIST_HEIGHT', 'WAIST_HEIGHT_RATIO')).toBeCloseTo(0.491, 3);
    expect(value(outcome, 'WAIST_HIP', 'WAIST_HIP_RATIO')).toBeCloseTo(0.88, 2);
  });

  it('G-06 · Durnin & Womersley + Siri: suma 56 mm, densidad 1.05261, 20.26 %, 16.21 kg y 63.79 kg', () => {
    expect(value(outcome, 'FAT_DW1974_SIRI1961', 'SKINFOLD_SUM_MM')).toBeCloseTo(56, 9);
    expect(value(outcome, 'FAT_DW1974_SIRI1961', 'BODY_DENSITY')).toBeCloseTo(1.05261, 5);
    expect(value(outcome, 'FAT_DW1974_SIRI1961', 'FAT_PCT')).toBeCloseTo(20.26, 2);
    expect(value(outcome, 'FAT_DW1974_SIRI1961', 'FAT_MASS_KG')).toBeCloseTo(16.21, 2);
    expect(value(outcome, 'FAT_DW1974_SIRI1961', 'FAT_FREE_MASS_KG')).toBeCloseTo(63.79, 2);
  });

  it('G-07 · Faulkner 16.03 % (67 mm) y Yuhasz 12.57 % (95 mm), con el aviso de población (RN-D06)', () => {
    expect(value(outcome, 'FAT_FAULKNER1968', 'FAT_PCT')).toBeCloseTo(16.03, 2);
    expect(value(outcome, 'FAT_FAULKNER1968', 'SKINFOLD_SUM_MM')).toBeCloseTo(67, 9);
    expect(value(outcome, 'FAT_YUHASZ1974', 'FAT_PCT')).toBeCloseTo(12.57, 2);
    expect(value(outcome, 'FAT_YUHASZ1974', 'SKINFOLD_SUM_MM')).toBeCloseTo(95, 9);
    const yuhasz = outcome.results.find((r) => r.methodCode === 'FAT_YUHASZ1974');
    expect(yuhasz?.warnings.map((w) => w.code)).toEqual(['NC-ENG-105']);
  });

  it('G-08 · 4 componentes con cada masa y su método: ósea 12.02 kg (Rocha), residual 19.28 (Würch), muscular 32.49', () => {
    expect(metric(outcome, 'COMP4_DEROSE_GUIMARAES', 'BONE_MASS_KG')).toMatchObject({
      methodCode: 'BONE_ROCHA1975',
      stored: true,
    });
    expect(value(outcome, 'COMP4_DEROSE_GUIMARAES', 'BONE_MASS_KG')).toBeCloseTo(12.02, 2);
    expect(metric(outcome, 'COMP4_DEROSE_GUIMARAES', 'RESIDUAL_MASS_KG').methodCode).toBe(
      'RESIDUAL_WURCH1974',
    );
    expect(value(outcome, 'COMP4_DEROSE_GUIMARAES', 'RESIDUAL_MASS_KG')).toBeCloseTo(19.28, 2);
    expect(value(outcome, 'COMP4_DEROSE_GUIMARAES', 'MUSCLE_MASS_KG')).toBeCloseTo(32.49, 2);
    expect(metric(outcome, 'COMP4_DEROSE_GUIMARAES', 'FAT_MASS_KG')).toMatchObject({
      methodCode: 'FAT_DW1974_SIRI1961',
      stored: false,
    });
  });

  it('G-09 · Lee: brazo corregido 29.23 cm y músculo esquelético 32.58 kg', () => {
    expect(value(outcome, 'MUSCLE_LEE2000', 'CORRECTED_ARM_GIRTH_CM')).toBeCloseTo(29.23, 2);
    expect(value(outcome, 'MUSCLE_LEE2000', 'SKELETAL_MUSCLE_MASS_KG')).toBeCloseTo(32.58, 2);
  });

  it('G-10 · Kerr: superficie 1.8599, piel 4.04, adiposa 23.44 (Z −0.691), muscular 35.92 (Z 1.58), ósea 8.722', () => {
    expect(value(outcome, 'COMP5_KERR1988', 'BODY_SURFACE_AREA_M2')).toBeCloseTo(1.8599, 4);
    expect(value(outcome, 'COMP5_KERR1988', 'SKIN_MASS_KG')).toBeCloseTo(4.04, 2);
    expect(value(outcome, 'COMP5_KERR1988', 'ADIPOSE_MASS_KG')).toBeCloseTo(23.44, 2);
    expect(metric(outcome, 'COMP5_KERR1988', 'ADIPOSE_MASS_KG').zScore).toBeCloseTo(-0.691, 3);
    expect(value(outcome, 'COMP5_KERR1988', 'MUSCLE_MASS_KG')).toBeCloseTo(35.92, 2);
    expect(metric(outcome, 'COMP5_KERR1988', 'MUSCLE_MASS_KG').zScore).toBeCloseTo(1.58, 2);
    expect(value(outcome, 'COMP5_KERR1988', 'BONE_MASS_KG')).toBeCloseTo(8.722, 3);
    expect(value(outcome, 'COMP5_KERR1988', 'HEAD_BONE_MASS_KG')).toBeCloseTo(1.325, 3);
    expect(value(outcome, 'COMP5_KERR1988', 'BODY_BONE_MASS_KG')).toBeCloseTo(7.397, 3);
    expect(value(outcome, 'COMP5_KERR1988', 'RESIDUAL_MASS_KG')).toBeCloseTo(9.46, 2);
    expect(metric(outcome, 'COMP5_KERR1988', 'RESIDUAL_MASS_KG').zScore).toBeCloseTo(2.44, 2);
    expect(value(outcome, 'COMP5_KERR1988', 'STRUCTURED_MASS_KG')).toBeCloseTo(81.59, 2);
    expect(value(outcome, 'COMP5_KERR1988', 'STRUCTURED_MASS_DIFF_PCT')).toBeCloseTo(1.98, 2);
  });

  it('G-11 · proporcionalidad: córmico 52.0, Manouvrier 92.31 y acromio-ilíaco 71.25', () => {
    expect(value(outcome, 'CORMIC_INDEX', 'CORMIC_INDEX')).toBeCloseTo(52.0, 2);
    expect(value(outcome, 'MANOUVRIER_INDEX', 'MANOUVRIER_INDEX')).toBeCloseTo(92.31, 2);
    expect(value(outcome, 'ACROMIOILIAC_INDEX', 'ACROMIOILIAC_INDEX')).toBeCloseTo(71.25, 2);
  });

  it('RN-D04 · Jackson y Pollock no se ofrece sin los 3 pliegues extra', () => {
    expect(outcome.unavailable).toContainEqual({
      methodCode: 'FAT_JP1978_7',
      reason: 'MISSING_SITES',
      missingSites: ['SKF_CHEST', 'SKF_MIDAXILLARY', 'SKF_SUPRAILIAC'],
      issues: [],
    });
  });

  it('RN-D05 · principales del adulto: Durnin & Womersley para la grasa, Lee para el músculo y Rocha (4 componentes) para el hueso', () => {
    expect(outcome.principal.get('FAT_DW1974_SIRI1961')).toEqual(['FAT_PCT']);
    expect(outcome.principal.get('MUSCLE_LEE2000')).toEqual(['MUSCLE']);
    expect(outcome.principal.get('COMP4_DEROSE_GUIMARAES')).toEqual(['BONE']);
  });

  it('RN-D11 · sin coeficiente de grupo de referencia, Lee no se calcula y lo explica', () => {
    const without = luis({ coefficient: null });
    expect(without.results.map((r) => r.methodCode)).not.toContain('MUSCLE_LEE2000');
    expect(without.unavailable.find((u) => u.methodCode === 'MUSCLE_LEE2000')).toMatchObject({
      reason: 'VALIDITY',
      issues: [expect.objectContaining({ code: 'NC-ENG-107', rule: 'RN-D11' })],
    });
    expect(without.principal.get('COMP4_DEROSE_GUIMARAES')).toEqual(['MUSCLE', 'BONE']);
  });

  it('RN-D01 · cada resultado lleva método, versión, versión del motor e insumos con su hash; mismos insumos, mismo hash', () => {
    for (const result of outcome.results) {
      expect(result.methodVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.engineVersion).toBe('1.4.0');
      expect(result.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(luis().results.map((r) => r.inputsHash)).toEqual(
      outcome.results.map((r) => r.inputsHash),
    );
    const otherLee = luis({ coefficient: -2 }).results.find(
      (r) => r.methodCode === 'MUSCLE_LEE2000',
    );
    expect(otherLee?.inputsHash).not.toBe(
      outcome.results.find((r) => r.methodCode === 'MUSCLE_LEE2000')?.inputsHash,
    );
  });
});
