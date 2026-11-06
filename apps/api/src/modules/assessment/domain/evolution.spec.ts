import { describe, expect, it } from 'vitest';
import { evolutionOf, type EvolutionInput } from './evolution.js';

const CONDITIONS = {
  schemaVersion: 1,
  fasting: true,
  intenseActivityLast24h: false,
  hydration: null,
} as const;

const evaluation = (
  evaluationId: string,
  localDate: string,
  changes: Partial<EvolutionInput> = {},
): EvolutionInput => ({
  evaluationId,
  localDate,
  compared: { evaluatorMemberId: 'ana', conditions: CONDITIONS, minutesOfDay: 510 },
  sites: new Map(),
  siteMdc95: new Map(),
  skinfoldSum6: null,
  skinfoldSum6Mdc95: null,
  metrics: [],
  bia: [],
  ...changes,
});

describe('RF-35 · la evolución antropométrica', () => {
  const september = evaluation('e1', '2026-09-15', {
    sites: new Map([
      ['SKF_TRICEPS', 12],
      ['SKF_ABDOMINAL', 25],
    ]),
    siteMdc95: new Map([
      ['SKF_TRICEPS', 1.04],
      ['SKF_ABDOMINAL', 1.6],
    ]),
    skinfoldSum6: 95,
    skinfoldSum6Mdc95: 6.4,
    metrics: [
      { metricCode: 'FAT_PCT', methodCode: 'FAT_DW1974_SIRI1961', unit: '%', value: 20.26 },
      { metricCode: 'FAT_PCT', methodCode: 'FAT_YUHASZ1974', unit: '%', value: 12.57 },
    ],
    bia: [
      {
        device: 'Marca Demo · BIA-200',
        metric: 'FAT_PCT',
        deviceLabel: '% Grasa',
        unit: '%',
        value: 18,
      },
    ],
  });
  const october = evaluation('e2', '2026-10-13', {
    compared: { evaluatorMemberId: 'beto', conditions: CONDITIONS, minutesOfDay: 510 },
    sites: new Map([
      ['SKF_TRICEPS', 11],
      ['SKF_ABDOMINAL', 22],
    ]),
    siteMdc95: new Map([
      ['SKF_TRICEPS', 1.04],
      ['SKF_ABDOMINAL', 1.6],
    ]),
    skinfoldSum6: 88.1,
    skinfoldSum6Mdc95: 6.18,
    metrics: [
      { metricCode: 'FAT_PCT', methodCode: 'FAT_DW1974_SIRI1961', unit: '%', value: 19.5 },
      { metricCode: 'FAT_PCT', methodCode: 'FAT_YUHASZ1974', unit: '%', value: 12.1 },
    ],
    bia: [
      {
        device: 'Marca Demo · BIA-200',
        metric: 'FAT_PCT',
        deviceLabel: '% Grasa',
        unit: '%',
        value: 17.5,
      },
    ],
  });
  const view = evolutionOf([september, october]);

  it('RN-C06: un cambio que no pasa el CMD95 es «sin cambio significativo»; el que lo pasa, cambio real', () => {
    const triceps = view.sites.find((site) => site.siteCode === 'SKF_TRICEPS');
    const abdominal = view.sites.find((site) => site.siteCode === 'SKF_ABDOMINAL');
    expect(triceps?.points.map((p) => [p.value, p.change, p.significance])).toEqual([
      [12, null, null],
      [11, -1, 'NO_SIGNIFICANT_CHANGE'],
    ]);
    expect(abdominal?.overall).toEqual({ change: -3, mdc95: 1.6, significance: 'CHANGE' });
  });

  it('G-04: la suma de 6 pliegues se compara con su CMD95 agrupado (−6.9 mm contra 6.18 mm)', () => {
    expect(view.skinfoldSum6?.overall?.change).toBeCloseTo(-6.9, 9);
    expect(view.skinfoldSum6?.overall?.mdc95).toBe(6.18);
    expect(view.skinfoldSum6?.overall?.significance).toBe('CHANGE');
  });

  it('RN-D03: métodos distintos nunca comparten serie; RN-C05: el CMD95 no se traslada al % de grasa', () => {
    expect(view.metrics.map((m) => [m.metricCode, m.methodCode, m.points.length])).toEqual([
      ['FAT_PCT', 'FAT_DW1974_SIRI1961', 2],
      ['FAT_PCT', 'FAT_YUHASZ1974', 2],
    ]);
    const durnin = view.metrics[0];
    expect(durnin?.overall?.change).toBeCloseTo(-0.76, 9);
    expect(durnin?.overall?.significance).toBeNull();
    expect(durnin?.points[1]?.mdc95).toBeNull();
  });

  it('RN-C08: la bioimpedancia va en su propia serie, rotulada con su equipo', () => {
    expect(view.bia).toHaveLength(1);
    expect(view.bia[0]).toMatchObject({
      device: 'Marca Demo · BIA-200',
      metric: 'FAT_PCT',
      deviceLabel: '% Grasa',
    });
    expect(view.bia[0]?.overall?.significance).toBeNull();
  });

  it('RN-C09: se advierte lo que cambió en las condiciones frente a la evaluación anterior', () => {
    expect(view.evaluations.map((e) => [e.evaluationId, e.conditionDifferences])).toEqual([
      ['e1', []],
      ['e2', ['EVALUATOR']],
    ]);
  });

  it('sin ETM del evaluador no se sabe si el cambio es real; un sitio medido una sola vez no tiene cambio', () => {
    const november = evaluation('e3', '2026-11-10', {
      sites: new Map([
        ['SKF_TRICEPS', 9],
        ['GIRTH_WAIST', 84],
      ]),
    });
    const three = evolutionOf([september, october, november]);
    const triceps = three.sites.find((site) => site.siteCode === 'SKF_TRICEPS');
    expect(triceps?.points.at(-1)).toMatchObject({
      change: -2,
      mdc95: null,
      significance: 'UNKNOWN',
    });
    expect(triceps?.overall).toEqual({ change: -3, mdc95: null, significance: 'UNKNOWN' });
    expect(three.sites.find((site) => site.siteCode === 'GIRTH_WAIST')?.overall).toBeNull();
    expect(evolutionOf([]).skinfoldSum6).toBeNull();
  });
});
