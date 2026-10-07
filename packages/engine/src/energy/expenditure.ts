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
  /** TMR del método elegido; su propio resultado guarda ese método. */
  readonly rmrKcal: number;
  /** PAL de vida diaria (RN-E02). */
  readonly pal: number;
  /** ADDITIVE: el PAL es solo la vida diaria y se suma el ejercicio. FACTORIAL: no se suma ejercicio (ADR-016). */
  readonly strategy: 'ADDITIVE' | 'FACTORIAL';
  /** El ejercicio entra neto, (MET − 1) × kg × horas, para no contar dos veces el reposo (RN-E03). */
  readonly exerciseMode: 'NET';
  /** Promedio diario del ejercicio neto (EE_MET_COMPENDIUM2024). */
  readonly exerciseDailyNetKcal: number;
  readonly ageYears: number;
}

export interface TeeOutput {
  readonly baseKcal: number;
  readonly exerciseKcal: number;
  readonly teeKcal: number;
}

/**
 * Gasto energético total: GET = TMR × PAL, más el ejercicio neto en la estrategia aditiva (RN-E02, RN-E03,
 * ADR-016). Validez de la fila «GET con PAL» de 03: aviso en menores de 18.
 */
export const TEE_PAL = defineMethod<TeeInput, TeeOutput>({
  code: 'TEE_PAL',
  version: '1.0.0',
  kind: 'ENERGY',
  population: 'ALL',
  requiredInputs: [
    'rmrKcal',
    'pal',
    'strategy',
    'exerciseMode',
    'exerciseDailyNetKcal',
    'ageYears',
  ],
  requiredSites: [],
  citation:
    'FAO/WHO/UNU. Human energy requirements. Food and Nutrition Technical Report Series 1, 2004',
  validity: [
    {
      rule: 'RN-E02',
      severity: 'ERROR',
      code: 'NC-ENG-211',
      message: 'El PAL de vida diaria va de 1.40 a 2.40.',
      when: ({ pal }) => !(pal >= PAL_RANGE[0] && pal <= PAL_RANGE[1]),
    },
    {
      severity: 'WARNING',
      code: 'NC-ENG-210',
      message:
        'El GET con PAL es de adultos: la versión 1.0 no calcula requerimientos pediátricos, que la FAO estima con otro método.',
      when: ({ ageYears }) => ageYears < 18,
    },
  ],
  compute: ({ rmrKcal, pal, strategy, exerciseDailyNetKcal }) => {
    const baseKcal = rmrKcal * pal;
    const exerciseKcal = strategy === 'ADDITIVE' ? exerciseDailyNetKcal : 0;
    return { outputs: { baseKcal, exerciseKcal, teeKcal: baseKcal + exerciseKcal } };
  },
});
