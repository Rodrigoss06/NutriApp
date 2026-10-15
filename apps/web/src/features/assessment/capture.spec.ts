import type { EvaluationResponse, MeasurementSite } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  attemptError,
  captureGroups,
  extraSiteOptions,
  parsePairs,
  previewAttempts,
} from './capture';

const site = (
  code: string,
  family: MeasurementSite['family'],
  displayOrder: number,
  levels: MeasurementSite['levels'] = ['ISAK1', 'ISAK2'],
): MeasurementSite => ({
  code,
  family,
  nameEs: code,
  unit: family === 'SKINFOLD' ? 'mm' : 'cm',
  minValue: family === 'SKINFOLD' ? 0 : 40,
  maxValue: family === 'SKINFOLD' ? 80 : 200,
  tolerancePct: family === 'SKINFOLD' ? 5 : 1,
  minAttempts: 2,
  levels,
  displayOrder,
});

describe('RN-C02 · RN-C03 · vista previa de la tercera toma mientras se escribe', () => {
  const triceps = site('SKF_TRICEPS', 'SKINFOLD', 50);

  it('G-01 · 12.0 y 12.4: diferencia 3.33 %, sin tercera toma, consolidado 12.2', () => {
    const preview = previewAttempts(triceps, [12.0, 12.4]);
    expect(preview.diffPct).toBeCloseTo(3.33, 2);
    expect(preview.needsThird).toBe(false);
    expect(preview.consolidated).toBeCloseTo(12.2, 2);
  });

  it('G-02 · 12.0 y 13.0: diferencia 8.33 %, pide la tercera', () => {
    const preview = previewAttempts(triceps, [12.0, 13.0]);
    expect(preview.diffPct).toBeCloseTo(8.33, 2);
    expect(preview.needsThird).toBe(true);
    expect(preview.consolidated).toBeNull();
  });

  it('G-03 · con 12.6 de tercera: la mediana, 12.6', () => {
    expect(previewAttempts(triceps, [12.0, 13.0, 12.6]).consolidated).toBeCloseTo(12.6, 2);
  });

  it('fuera de los pliegues la tolerancia es 1 %: 160.0 y 162.0 piden la tercera', () => {
    expect(previewAttempts(site('BASIC_HEIGHT', 'BASIC', 20), [160, 162]).needsThird).toBe(true);
    expect(previewAttempts(site('BASIC_HEIGHT', 'BASIC', 20), [160, 160.2]).needsThird).toBe(false);
  });

  it('con una sola toma todavía no hay diferencia ni consolidado', () => {
    expect(previewAttempts(triceps, [12])).toEqual({
      diffPct: null,
      needsThird: false,
      consolidated: null,
    });
  });
});

describe('RN-C04 · una toma fuera del rango del catálogo no se guarda', () => {
  const waist = site('GIRTH_WAIST', 'GIRTH', 200);

  it.each([
    [39.9, 'Fuera del rango aceptado: de 40 a 200 cm.'],
    [200.1, 'Fuera del rango aceptado: de 40 a 200 cm.'],
    [86.123, 'Usa hasta 2 decimales.'],
  ])('%s → %s', (value, message) => {
    expect(attemptError(waist, value)).toBe(message);
  });

  it('dentro del rango y con 2 decimales, sin error', () => {
    expect(attemptError(waist, 86.25)).toBeNull();
  });
});

describe('RN-C01 · los sitios del nivel, más los extra con tomas, por familia', () => {
  const sites = [
    site('BASIC_WEIGHT', 'BASIC', 10, ['BASIC', 'ISAK1', 'ISAK2']),
    site('SKF_TRICEPS', 'SKINFOLD', 50),
    site('GIRTH_WAIST', 'GIRTH', 200, ['BASIC', 'ISAK1', 'ISAK2']),
    site('SKF_CHEST', 'SKINFOLD', 430, []),
  ];
  const evaluation = {
    progress: {
      requiredSites: ['BASIC_WEIGHT', 'GIRTH_WAIST'],
      missingSites: [],
      needsThirdSites: [],
      canClose: false,
    },
    measurements: [
      {
        siteCode: 'SKF_TRICEPS',
        attempts: [12, 12.4],
        side: 'RIGHT',
        consolidatedValue: 12.2,
        consolidation: 'MEAN_2',
        diffPct: 3.33,
        needsThird: false,
      },
    ],
  } satisfies Pick<EvaluationResponse, 'progress' | 'measurements'>;

  it('una evaluación básica con un tríceps extra muestra básicas, pliegues y perímetros', () => {
    expect(
      captureGroups(sites, evaluation).map((g) => [g.family, g.sites.map((s) => s.code)]),
    ).toEqual([
      ['BASIC', ['BASIC_WEIGHT']],
      ['SKINFOLD', ['SKF_TRICEPS']],
      ['GIRTH', ['GIRTH_WAIST']],
    ]);
  });

  it('«Agregar sitio» ofrece solo lo que no está en la captura', () => {
    expect(extraSiteOptions(sites, evaluation).map((s) => s.code)).toEqual(['SKF_CHEST']);
  });

  it('un sitio recién agregado aparece en su familia aunque todavía no tenga tomas', () => {
    expect(
      captureGroups(sites, evaluation, ['SKF_CHEST']).find((g) => g.family === 'SKINFOLD')?.sites,
    ).toHaveLength(2);
    expect(extraSiteOptions(sites, evaluation, ['SKF_CHEST'])).toEqual([]);
  });
});

describe('RN-C05 · los pares del estudio de ETM se escriben de a dos por línea', () => {
  it('acepta espacio, tabulación o punto y coma, y coma decimal', () => {
    expect(parsePairs('12.0 12.4\n16,0\t15,6\n 25;26 ')).toEqual([
      [12, 12.4],
      [16, 15.6],
      [25, 26],
    ]);
  });

  it.each(['', '12.0', '12.0 12.4 12.6', '12.0 abc'])('«%s» no es una lista de pares', (text) => {
    expect(parsePairs(text)).toBeNull();
  });
});
