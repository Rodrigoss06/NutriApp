import type { EvolutionResponse } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  evaluationsByMonth,
  metricName,
  seriesOptions,
  trendRange,
  trendRows,
} from './evolution-view';

const E1 = '0193a000-0000-7000-8000-000000000001';
const E2 = '0193a000-0000-7000-8000-000000000002';
const point = (evaluationId: string, localDate: string, value: number) => ({
  evaluationId,
  localDate,
  value,
  change: null,
  mdc95: null,
  significance: null,
});
const two = (first: number, second: number) => ({
  points: [point(E1, '2026-09-15', first), point(E2, '2026-10-13', second)],
  overall: null,
});

const evaluation = (evaluationId: string, localDate: string) => ({
  evaluationId,
  localDate,
  kind: 'ANTHROPOMETRY' as const,
  level: 'ISAK2' as const,
  revision: 1,
  evaluatorMemberId: E1,
  conditionDifferences: [],
});

const EVOLUTION: EvolutionResponse = {
  evaluations: [evaluation(E1, '2026-09-15'), evaluation(E2, '2026-10-13')],
  sites: [
    { siteCode: 'BASIC_WEIGHT', name: 'Peso', family: 'BASIC', unit: 'kg', ...two(81.2, 80) },
    {
      siteCode: 'BREADTH_HUMERUS',
      name: 'Húmero',
      family: 'BREADTH',
      unit: 'cm',
      points: [point(E2, '2026-10-13', 7)],
      overall: null,
    },
  ],
  skinfoldSum6: two(101.9, 95),
  metrics: [
    { metricCode: 'FAT_PCT', methodCode: 'FAT_DW1974_SIRI1961', unit: '%', ...two(21.1, 20.26) },
    { metricCode: 'FAT_PCT', methodCode: 'FAT_YUHASZ1974', unit: '%', ...two(13.1, 12.57) },
  ],
  bia: [
    {
      device: 'Marca Demo · BIA-200',
      metric: 'FAT_PCT',
      deviceLabel: '% Grasa',
      unit: '%',
      ...two(19, 18.4),
    },
  ],
};

describe('RF-35 · la evolución en pantalla', () => {
  it('RN-D03 · RN-C08: una serie por método y otra por equipo; nunca dos métodos en el mismo gráfico', () => {
    expect(seriesOptions(EVOLUTION).map((option) => option.label)).toEqual([
      'Suma de 6 pliegues',
      'Peso',
      '% de grasa (Durnin & Womersley (1974) + Siri)',
      '% de grasa (Yuhasz (versión de Carter, 6 pliegues))',
      'Grasa corporal · Marca Demo · BIA-200',
    ]);
    const keys = seriesOptions(EVOLUTION).map((option) => option.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('una medida tomada una sola vez no tiene evolución que dibujar', () => {
    expect(seriesOptions(EVOLUTION).some((option) => option.label === 'Húmero')).toBe(false);
  });

  it('RN-D02: el método va al lado de cada número; la bioimpedancia es una lectura del equipo', () => {
    const [sum, , durnin, , bia] = seriesOptions(EVOLUTION);
    expect(sum?.methodCode).toBe('CONSOLIDATE_ISAK');
    expect(durnin?.methodCode).toBe('FAT_DW1974_SIRI1961');
    expect(bia).toMatchObject({ methodCode: null, format: { type: 'reading' }, unit: '%' });
    expect(metricName('BONE_MASS_KG', 'BONE_ROCHA1975')).toBe('Masa ósea (Rocha)');
  });

  it('RN-G09: la tendencia va desde el mes de la primera evaluación, hasta 24 meses', () => {
    expect(trendRange(EVOLUTION.evaluations, '2026-11-06')).toEqual({
      from: '2026-09-01',
      to: '2026-11-06',
    });
    expect(trendRange([evaluation(E1, '2023-01-10')], '2026-11-06').from).toBe('2024-12-01');
    expect(trendRange([], '2026-11-06').from).toBe('2025-12-01');
    expect([...evaluationsByMonth(EVOLUTION.evaluations)]).toEqual([
      ['2026-09', ['2026-09-15']],
      ['2026-10', ['2026-10-13']],
    ]);
  });

  it('RN-G09: cada mes con registros o con una evaluación, del más reciente al más antiguo', () => {
    const november = {
      month: '2026-11',
      daysWithTarget: 3,
      daysLogged: 3,
      daysInRange: 2,
      kcal: { consumed: 1800, target: 1835, adequacyPct: 98.1, complete: true },
      sessionsDone: 2,
      sessionsPlanned: 3,
    };
    expect(
      trendRows([november], EVOLUTION.evaluations).map((row) => [
        row.month,
        row.evaluations,
        row.trend?.daysInRange ?? null,
      ]),
    ).toEqual([
      ['2026-11', [], 2],
      ['2026-10', ['2026-10-13'], null],
      ['2026-09', ['2026-09-15'], null],
    ]);
  });
});
