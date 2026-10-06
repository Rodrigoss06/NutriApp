import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { sum } from '../stats.js';
import type { Kg } from '../units.js';

/** Rango de PAL de vida diaria de FAO/OMS/UNU 2004 (RN-E02). */
export const PAL_RANGE = [1.4, 2.4] as const;

export interface ActivityInput {
  /** Código del Compendium 2024, si viene del catálogo. */
  readonly code?: string;
  readonly met: number;
  readonly minutesPerSession: number;
  readonly sessionsPerWeek: number;
}

export interface ActivityOutput {
  readonly code?: string;
  readonly grossKcalPerSession: number;
  readonly netKcalPerSession: number;
}

export interface MetInput {
  readonly weightKg: Kg;
  readonly activities: readonly ActivityInput[];
}

export interface MetOutput {
  readonly activities: readonly ActivityOutput[];
  readonly weeklyNetKcal: number;
  /** Kcal netas de las sesiones de la semana ÷ 7 (RN-E03). */
  readonly dailyAverageNetKcal: number;
}

/** Ejercicio por METs: neto = (MET − 1) × kg × horas, para no contar dos veces el reposo (RN-E03). */
export const EE_MET_COMPENDIUM2024 = defineMethod<MetInput, MetOutput>({
  code: 'EE_MET_COMPENDIUM2024',
  version: '1.0.0',
  kind: 'ENERGY',
  population: 'ALL',
  requiredInputs: ['weightKg', 'activities'],
  requiredSites: [],
  citation:
    'Herrmann SD, Willis EA, Ainsworth BE, et al. 2024 Adult Compendium of Physical Activities. J Sport Health Sci 2024',
  validity: [],
  compute: ({ weightKg, activities }) => {
    const outputs = activities.map(({ code, met, minutesPerSession }) => {
      const hours = minutesPerSession / 60;
      return {
        ...(code === undefined ? {} : { code }),
        grossKcalPerSession: met * weightKg * hours,
        netKcalPerSession: (met - 1) * weightKg * hours,
      };
    });
    const weeklyNetKcal = sum(
      outputs.map(
        (activity, index) => activity.netKcalPerSession * (activities[index]?.sessionsPerWeek ?? 0),
      ),
    );
    const issues: Issue[] = activities.some(({ met }) => met < 1)
      ? [
          {
            rule: 'RN-E03',
            severity: 'ERROR',
            code: 'NC-ENG-205',
            message: 'Un MET es al menos 1, el gasto en reposo.',
          },
        ]
      : [];
    return {
      outputs: { activities: outputs, weeklyNetKcal, dailyAverageNetKcal: weeklyNetKcal / 7 },
      issues,
    };
  },
});

export interface TeeInput {
  /** TMR del método elegido; su resultado guarda el método. */
  readonly rmrKcal: number;
  readonly pal: number;
  /** ADDITIVE: el PAL es solo la vida diaria y se suma el ejercicio neto. FACTORIAL: no se suma ejercicio. */
  readonly strategy: 'ADDITIVE' | 'FACTORIAL';
  readonly exerciseDailyNetKcal: number;
  readonly ageYears: number;
}

export type TeeResult =
  | {
      readonly ok: true;
      readonly outputs: {
        readonly baseKcal: number;
        readonly exerciseKcal: number;
        readonly teeKcal: number;
      };
      readonly warnings: readonly Issue[];
    }
  | { readonly ok: false; readonly errors: readonly Issue[]; readonly warnings: readonly Issue[] };

/**
 * GET = TMR × PAL (+ ejercicio neto en la estrategia aditiva), RN-E02 y ADR-016. 02 §9 no le da código
 * propio: la prescripción guarda cada componente con su método.
 */
export function totalEnergyExpenditure(input: TeeInput): TeeResult {
  const warnings: Issue[] =
    input.ageYears < 18
      ? [
          {
            rule: 'RN-D06',
            severity: 'WARNING',
            code: 'NC-ENG-210',
            message:
              'El GET con PAL es de adultos: la versión 1.0 no calcula requerimientos pediátricos, que la FAO estima con otro método.',
          },
        ]
      : [];
  const [minPal, maxPal] = PAL_RANGE;
  if (!(input.pal >= minPal && input.pal <= maxPal)) {
    return {
      ok: false,
      errors: [
        {
          rule: 'RN-E02',
          severity: 'ERROR',
          code: 'NC-ENG-211',
          message: 'El PAL de vida diaria va de 1.40 a 2.40.',
        },
      ],
      warnings,
    };
  }
  const baseKcal = input.rmrKcal * input.pal;
  const exerciseKcal = input.strategy === 'ADDITIVE' ? input.exerciseDailyNetKcal : 0;
  return {
    ok: true,
    outputs: { baseKcal, exerciseKcal, teeKcal: baseKcal + exerciseKcal },
    warnings,
  };
}
