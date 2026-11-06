import { describe, expect, it } from 'vitest';
import {
  evolutionResponseSchema,
  PATIENT_EVOLUTION_ITEMS,
  PATIENT_EVOLUTION_LABELS,
  patientEvolutionResponseSchema,
} from './evolution.js';

const EVALUATION = '0193a000-0000-7000-8000-000000000001';
const point = { evaluationId: EVALUATION, localDate: '2026-10-13', value: 95 };

describe('RF-35 · el contrato de la evolución', () => {
  it('RN-C06: una medida lleva su CMD95 y su significancia; un número derivado, no (RN-C05)', () => {
    const parsed = evolutionResponseSchema.parse({
      evaluations: [
        {
          evaluationId: EVALUATION,
          localDate: '2026-10-13',
          kind: 'ANTHROPOMETRY',
          level: 'ISAK2',
          revision: 1,
          evaluatorMemberId: EVALUATION,
          conditionDifferences: ['EVALUATOR'],
        },
      ],
      sites: [
        {
          siteCode: 'SKF_ABDOMINAL',
          name: 'Abdominal',
          family: 'SKINFOLD',
          unit: 'mm',
          points: [{ ...point, change: -1, mdc95: 1.6, significance: 'NO_SIGNIFICANT_CHANGE' }],
          overall: null,
        },
      ],
      skinfoldSum6: null,
      metrics: [
        {
          metricCode: 'FAT_PCT',
          methodCode: 'FAT_DW1974_SIRI1961',
          unit: '%',
          points: [{ ...point, change: null, mdc95: null, significance: null }],
          overall: null,
        },
      ],
      bia: [],
    });
    expect(parsed.metrics[0]?.points[0]?.significance).toBeNull();
    expect(
      evolutionResponseSchema.safeParse({
        ...parsed,
        evaluations: [{ conditionDifferences: ['X'] }],
      }).success,
    ).toBe(false);
  });

  it('RF-30: el paciente ve lo principal, cada uno con su nombre', () => {
    expect(PATIENT_EVOLUTION_ITEMS.map((item) => PATIENT_EVOLUTION_LABELS[item])).toEqual([
      'Peso',
      'Cintura',
      'Suma de 6 pliegues',
      '% de grasa',
      'Masa muscular',
    ]);
    expect(
      patientEvolutionResponseSchema.safeParse({
        evaluationCount: 1,
        items: [
          {
            item: 'WEIGHT',
            unit: 'kg',
            methodCode: 'CONSOLIDATE_ISAK',
            points: [{ ...point, change: null, mdc95: null, significance: null }],
            overall: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
