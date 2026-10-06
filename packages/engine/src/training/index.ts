import { defineMethod } from '../registry/run-method.js';
import type { Issue, ValidityRule } from '../registry/types.js';
import { mean, sum } from '../stats.js';
import type { Kg } from '../units.js';

export interface SetLog {
  readonly exercise: string;
  readonly loadKg: Kg;
  readonly reps: number;
  /** Las series de calentamiento no cuentan (RN-F03, RN-F06). */
  readonly warmup?: boolean;
}

const effective = <T extends { readonly warmup?: boolean }>(sets: readonly T[]): T[] =>
  sets.filter((set) => set.warmup !== true);

/** Tonelaje = Σ peso × repeticiones de las series efectivas (RN-F03). */
export const TONNAGE = defineMethod<
  { readonly sets: readonly SetLog[] },
  { readonly tonnageKg: number }
>({
  code: 'TONNAGE',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['sets'],
  requiredSites: [],
  citation: 'Volume load (Haff 2010); guía de dominio §6.2',
  validity: [],
  compute: ({ sets }) => ({
    outputs: { tonnageKg: sum(effective(sets).map(({ loadKg, reps }) => loadKg * reps)) },
  }),
});

/** Límite de repeticiones para estimar el 1RM (RN-F04 y 03, «Validez por método»). */
export const ONE_RM_MAX_REPS = 12;

export interface OneRmInput {
  readonly loadKg: Kg;
  readonly reps: number;
}

export interface OneRmOutput {
  readonly oneRmKg: Kg;
  /** Siempre estimado: se rotula así en la interfaz (RN-F04). */
  readonly estimated: true;
}

const oneRmValidity: ValidityRule<OneRmInput>[] = [
  {
    severity: 'ERROR',
    code: 'NC-ENG-401',
    message: 'Con más de 12 repeticiones no se estima el 1RM.',
    when: ({ reps }) => reps > ONE_RM_MAX_REPS,
  },
];

const repsIssue = (reps: number): Issue[] =>
  Number.isInteger(reps) && reps >= 1
    ? []
    : [
        {
          rule: 'RN-F04',
          severity: 'ERROR',
          code: 'NC-ENG-402',
          message: 'Las repeticiones son un entero positivo.',
        },
      ];

const oneRm = (
  code: 'ONERM_EPLEY1985' | 'ONERM_BRZYCKI1993',
  citation: string,
  formula: (loadKg: number, reps: number) => number,
) =>
  defineMethod<OneRmInput, OneRmOutput>({
    code,
    version: '1.0.0',
    kind: 'TRAINING',
    population: 'ALL',
    requiredInputs: ['loadKg', 'reps'],
    requiredSites: [],
    citation,
    validity: oneRmValidity,
    compute: ({ loadKg, reps }) => ({
      outputs: { oneRmKg: (reps === 1 ? loadKg : formula(loadKg, reps)) as Kg, estimated: true },
      issues: repsIssue(reps),
    }),
  });

export const ONERM_EPLEY1985 = oneRm(
  'ONERM_EPLEY1985',
  'Epley B. Poundage chart. Boyd Epley Workout, 1985',
  (loadKg, reps) => loadKg * (1 + reps / 30),
);

export const ONERM_BRZYCKI1993 = oneRm(
  'ONERM_BRZYCKI1993',
  'Brzycki M. Strength testing: predicting a one-rep max from reps-to-fatigue. JOPERD 1993;64:88-90',
  (loadKg, reps) => loadKg * (36 / (37 - reps)),
);

/** RPE ≈ 10 − RIR (RN-F05). */
export const RPE_FROM_RIR = defineMethod<{ readonly rir: number }, { readonly rpe: number }>({
  code: 'RPE_FROM_RIR',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['rir'],
  requiredSites: [],
  citation: 'Zourdos MC, et al. J Strength Cond Res 2016;30:267-75',
  validity: [],
  compute: ({ rir }) => ({
    outputs: { rpe: 10 - rir },
    issues:
      rir >= 0 && rir <= 10
        ? []
        : [
            {
              rule: 'RN-F05',
              severity: 'ERROR',
              code: 'NC-ENG-403',
              message: 'El RIR va de 0 a 10.',
            },
          ],
  }),
});

export interface MuscleRole {
  readonly muscle: string;
  readonly role: 'PRIMARY' | 'SECONDARY';
}

export interface FractionalSetsInput {
  readonly sets: readonly Pick<SetLog, 'exercise' | 'warmup'>[];
  readonly muscleMap: Readonly<Record<string, readonly MuscleRole[]>>;
}

/** Conteo fraccional: músculo principal 1 y secundario 0.5, solo series efectivas (RN-F06). */
export const FRACTIONAL_SETS = defineMethod<
  FractionalSetsInput,
  { readonly setsByMuscle: Readonly<Record<string, number>> }
>({
  code: 'FRACTIONAL_SETS',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['sets', 'muscleMap'],
  requiredSites: [],
  citation: 'Pelland JC, et al. Meta-regresión de volumen con conteo fraccional de series, 2025',
  validity: [],
  compute: ({ sets, muscleMap }) => {
    const setsByMuscle: Record<string, number> = {};
    for (const { exercise } of effective(sets)) {
      for (const { muscle, role } of muscleMap[exercise] ?? []) {
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + (role === 'PRIMARY' ? 1 : 0.5);
      }
    }
    return { outputs: { setsByMuscle } };
  },
});

export interface SfrRating {
  readonly stimulus: number;
  readonly fatigue: number;
}

const isRating = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 5;

/** SFR = promedio de estímulo ÷ promedio de fatiga; heurística de entrenadores (RN-F07). */
export const SFR = defineMethod<
  { readonly ratings: readonly SfrRating[] },
  { readonly sfr: number; readonly label: 'HEURISTIC' }
>({
  code: 'SFR',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['ratings'],
  requiredSites: [],
  citation:
    'Israetel M. Stimulus-to-Fatigue Ratio, Renaissance Periodization (heurística, sin validación)',
  validity: [],
  compute: ({ ratings }) => {
    const valid =
      ratings.length > 0 &&
      ratings.every(({ stimulus, fatigue }) => isRating(stimulus) && isRating(fatigue));
    return {
      outputs: {
        sfr:
          mean(ratings.map(({ stimulus }) => stimulus)) /
          mean(ratings.map(({ fatigue }) => fatigue)),
        label: 'HEURISTIC',
      },
      issues: valid
        ? []
        : [
            {
              rule: 'RN-F07',
              severity: 'ERROR',
              code: 'NC-ENG-404',
              message:
                'Estímulo y fatiga son valoraciones enteras de 1 a 5, y hace falta al menos una.',
            },
          ],
    };
  },
});

/** Cumplimiento = realizado ÷ prescrito × 100; 0 si no hubo prescripción (RN-F09). */
export const COMPLIANCE = defineMethod<
  { readonly done: number; readonly planned: number },
  { readonly compliancePct: number }
>({
  code: 'COMPLIANCE',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['done', 'planned'],
  requiredSites: [],
  citation: 'Cumplimiento de la prescripción; guía de dominio §6.7',
  validity: [],
  compute: ({ done, planned }) => ({
    outputs: { compliancePct: planned === 0 ? 0 : (done / planned) * 100 },
  }),
});
