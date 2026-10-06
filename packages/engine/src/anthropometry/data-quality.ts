import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { mean, median, sum } from '../stats.js';

const ISAK = 'ISAK, Estándares internacionales para la valoración antropométrica (2001)';

/** Tolerancia entre la 1.ª y la 2.ª toma: 5 % en pliegues y 1 % en el resto (RN-C02). */
export const TOLERANCE_PCT = { SKINFOLD: 5, OTHER: 1 } as const;

export interface ConsolidateInput {
  readonly family: keyof typeof TOLERANCE_PCT;
  readonly attempts: readonly number[];
}

export interface ConsolidateOutput {
  /** Consolidado; null mientras falte la tercera toma. */
  readonly value: number | null;
  readonly diffPct: number;
  readonly needsThird: boolean;
  readonly consolidation: 'MEAN_2' | 'MEDIAN_3' | null;
}

const relativeDiffPct = (first: number, second: number): number => {
  if (first === 0) return second === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (Math.abs(second - first) / first) * 100;
};

/** Consolidación ISAK: media de dos tomas válidas, mediana de tres (RN-C02, RN-C03). */
export const CONSOLIDATE_ISAK = defineMethod<ConsolidateInput, ConsolidateOutput>({
  code: 'CONSOLIDATE_ISAK',
  version: '1.0.0',
  kind: 'DATA_QUALITY',
  population: 'ALL',
  requiredInputs: ['family', 'attempts'],
  requiredSites: [],
  citation: ISAK,
  validity: [],
  measurements: ({ family, attempts }) =>
    family === 'SKINFOLD'
      ? attempts.map((value, index) => ({
          field: `attempts[${index}]`,
          kind: 'SKINFOLD_MM',
          value,
        }))
      : [],
  compute: ({ family, attempts }) => {
    const [first = 0, second = 0] = attempts;
    const diffPct = relativeDiffPct(first, second);
    if (attempts.length < 2 || attempts.length > 3) {
      return {
        outputs: { value: null, diffPct, needsThird: false, consolidation: null },
        issues: [
          {
            rule: 'RN-C02',
            severity: 'ERROR',
            code: 'NC-ENG-010',
            message: 'Cada sitio se consolida con dos o tres tomas.',
          },
        ],
      };
    }
    if (attempts.length === 3) {
      return {
        outputs: { value: median(attempts), diffPct, needsThird: false, consolidation: 'MEDIAN_3' },
      };
    }
    const needsThird = diffPct > TOLERANCE_PCT[family];
    return {
      outputs: needsThird
        ? { value: null, diffPct, needsThird, consolidation: null }
        : { value: mean(attempts), diffPct, needsThird, consolidation: 'MEAN_2' },
    };
  },
});

export interface TemInput {
  /** Pares de 1.ª y 2.ª toma del mismo sitio. */
  readonly pairs: readonly (readonly [number, number])[];
}

export interface TemOutput {
  readonly temAbs: number;
  readonly temRelPct: number;
}

const noPairs: Issue = {
  rule: 'RN-C05',
  severity: 'ERROR',
  code: 'NC-ENG-011',
  message: 'El ETM necesita al menos un par de tomas.',
};

/** ETM = √(Σd² / 2n) y %ETM = ETM / media × 100 (RN-C05). */
export const TEM_ISAK = defineMethod<TemInput, TemOutput>({
  code: 'TEM_ISAK',
  version: '1.0.0',
  kind: 'DATA_QUALITY',
  population: 'ALL',
  requiredInputs: ['pairs'],
  requiredSites: [],
  citation: `${ISAK}; Perini et al. 2005, error técnico de medida`,
  validity: [],
  compute: ({ pairs }) => {
    if (pairs.length === 0) {
      return { outputs: { temAbs: Number.NaN, temRelPct: Number.NaN }, issues: [noPairs] };
    }
    const n = pairs.length;
    const temAbs = Math.sqrt(sum(pairs.map(([a, b]) => (a - b) ** 2)) / (2 * n));
    const pairMean = sum(pairs.map(([a, b]) => a + b)) / (2 * n);
    return { outputs: { temAbs, temRelPct: (temAbs / pairMean) * 100 } };
  },
});

export interface Mdc95Input {
  /** Error de medida en la misma unidad que la medida. */
  readonly measurementError: number;
}

/** CMD95 = 1.96 × √2 × error de medida (RN-C05). */
export const MDC95 = defineMethod<Mdc95Input, { readonly mdc95: number }>({
  code: 'MDC95',
  version: '1.0.0',
  kind: 'DATA_QUALITY',
  population: 'ALL',
  requiredInputs: ['measurementError'],
  requiredSites: [],
  citation: 'Weir 2005, cambio mínimo detectable al 95 %',
  validity: [],
  compute: ({ measurementError }) =>
    measurementError < 0 || !Number.isFinite(measurementError)
      ? {
          outputs: { mdc95: Number.NaN },
          issues: [
            {
              rule: 'RN-C05',
              severity: 'ERROR',
              code: 'NC-ENG-012',
              message: 'El error de medida es un número positivo.',
            },
          ],
        }
      : { outputs: { mdc95: 1.96 * Math.SQRT2 * measurementError } },
});
