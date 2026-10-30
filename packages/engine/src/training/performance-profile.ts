import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { mean, sum } from '../stats.js';

/** Los siete dominios de la anamnesis, en el orden de la hoja: en un empate de prioridad gana el primero (07 §12). */
export const PROFILE_DOMAINS = [
  'OBJECTIVE',
  'AVAILABILITY',
  'EXPERIENCE',
  'RECOVERY',
  'LIFESTYLE',
  'NUTRITION',
  'ADHERENCE',
] as const;
export type ProfileDomain = (typeof PROFILE_DOMAINS)[number];

/** Peso de cada dominio en el PRI, en puntos porcentuales para no arrastrar errores de coma flotante (RN-F16). */
const DOMAIN_WEIGHT_PCT: Readonly<Record<ProfileDomain, number>> = {
  OBJECTIVE: 10,
  AVAILABILITY: 15,
  EXPERIENCE: 15,
  RECOVERY: 20,
  LIFESTYLE: 10,
  NUTRITION: 10,
  ADHERENCE: 20,
};

export const EXPERIENCE_OPTIONS = ['LT_3M', 'M3_12', 'Y1_3', 'GT_3Y'] as const;
export const CONSISTENCY_OPTIONS = ['CONSISTENT', 'INTERMITTENT', 'INACTIVE'] as const;
export const ALCOHOL_OPTIONS = ['NO', 'OCCASIONAL', 'WEEKLY', 'FREQUENT'] as const;
export const NICOTINE_OPTIONS = ['NO', 'YES'] as const;
export const DIET_PATTERN_OPTIONS = ['STRUCTURED', 'VARIABLE', 'RESTRICTIVE', 'OTHER'] as const;
export const PROTEIN_OPTIONS = ['RARELY', 'SOMETIMES', 'USUALLY'] as const;
export const FRUIT_VEG_OPTIONS = ['LOW', 'MODERATE', 'HIGH'] as const;

type Scorer = (answer: number | string) => number | null;

const isScale = (answer: number | string): answer is number =>
  typeof answer === 'number' && Number.isInteger(answer) && answer >= 1 && answer <= 5;

const direct: Scorer = (answer) => (isScale(answer) ? answer : null);
const inverse: Scorer = (answer) => (isScale(answer) ? 6 - answer : null);

const isQuantity = (answer: number | string): answer is number =>
  typeof answer === 'number' && Number.isFinite(answer) && answer >= 0;

/** Umbrales «igual o mayor»: el primero que se alcanza da sus puntos; por debajo de todos, 1 (07 §12). */
const atLeast =
  (thresholds: readonly (readonly [number, number])[]): Scorer =>
  (answer) =>
    isQuantity(answer) ? (thresholds.find(([limit]) => answer >= limit)?.[1] ?? 1) : null;

/** Umbrales «igual o menor» de L01: el primero que no se pasa da sus puntos; por encima de todos, 1 (07 §12). */
const atMost =
  (thresholds: readonly (readonly [number, number])[]): Scorer =>
  (answer) =>
    isQuantity(answer) ? (thresholds.find(([limit]) => answer <= limit)?.[1] ?? 1) : null;

/** A01 pide un número entero: la hoja compara con igualdad y un decimal no entra en ninguno de sus umbrales. */
const whole =
  (score: Scorer): Scorer =>
  (answer) =>
    typeof answer === 'number' && !Number.isInteger(answer) ? null : score(answer);

const options =
  (points: Readonly<Record<string, number>>): Scorer =>
  (answer) =>
    typeof answer === 'string' ? (points[answer] ?? null) : null;

/** Las 29 preguntas que puntúan (07 §12), cada una con su dominio y sus puntos de 1 a 5. */
const QUESTIONS = {
  G03: ['OBJECTIVE', direct],
  G04: ['OBJECTIVE', direct],
  A01: [
    'AVAILABILITY',
    whole(
      atLeast([
        [5, 5],
        [4, 4],
        [3, 3],
        [2, 2],
      ]),
    ),
  ],
  A02: [
    'AVAILABILITY',
    atLeast([
      [75, 5],
      [60, 4],
      [45, 3],
      [30, 2],
    ]),
  ],
  A03: ['AVAILABILITY', direct],
  A04: ['AVAILABILITY', direct],
  E01: ['EXPERIENCE', options({ LT_3M: 1, M3_12: 2, Y1_3: 4, GT_3Y: 5 })],
  E02: ['EXPERIENCE', options({ CONSISTENT: 5, INTERMITTENT: 3, INACTIVE: 1 })],
  E03: ['EXPERIENCE', direct],
  E04: ['EXPERIENCE', direct],
  R01: [
    'RECOVERY',
    atLeast([
      [8, 5],
      [7, 4],
      [6, 3],
      [5, 2],
    ]),
  ],
  R02: ['RECOVERY', direct],
  R03: ['RECOVERY', direct],
  R04: ['RECOVERY', inverse],
  R05: ['RECOVERY', inverse],
  R06: ['RECOVERY', direct],
  L01: [
    'LIFESTYLE',
    atMost([
      [4, 5],
      [6, 4],
      [8, 3],
      [10, 2],
    ]),
  ],
  L02: [
    'LIFESTYLE',
    atLeast([
      [10000, 5],
      [7500, 4],
      [5000, 3],
      [3000, 2],
    ]),
  ],
  L03: ['LIFESTYLE', options({ NO: 5, OCCASIONAL: 4, WEEKLY: 3, FREQUENT: 1 })],
  L04: ['LIFESTYLE', options({ NO: 5, YES: 2 })],
  N01: ['NUTRITION', options({ STRUCTURED: 5, VARIABLE: 3, RESTRICTIVE: 2, OTHER: 3 })],
  N02: ['NUTRITION', options({ USUALLY: 5, SOMETIMES: 3, RARELY: 1 })],
  N03: ['NUTRITION', options({ HIGH: 5, MODERATE: 3, LOW: 1 })],
  N04: [
    'NUTRITION',
    atLeast([
      [2.5, 5],
      [2, 4],
      [1.5, 3],
      [1, 2],
    ]),
  ],
  H01: ['ADHERENCE', direct],
  H02: ['ADHERENCE', direct],
  H03: ['ADHERENCE', inverse],
  H04: ['ADHERENCE', direct],
  H05: ['ADHERENCE', direct],
} as const satisfies Readonly<Record<string, readonly [ProfileDomain, Scorer]>>;

export type ScoredQuestion = keyof typeof QUESTIONS;
export const SCORED_QUESTIONS = Object.keys(QUESTIONS) as readonly ScoredQuestion[];

/** Lo respondido: una pregunta sin responder va ausente o en null, y no cuenta (RN-F16). */
export type PerformanceAnswers = Readonly<Partial<Record<ScoredQuestion, number | string | null>>>;

export interface PerformanceClasses {
  readonly recoveryCapacity: 'HIGH' | 'MODERATE' | 'LOW' | null;
  readonly availability: 'HIGH' | 'MODERATE' | 'LIMITED' | null;
  readonly experience: 'ADVANCED' | 'INTERMEDIATE' | 'BASIC' | null;
  readonly adherenceRisk: 'LOW' | 'MODERATE' | 'HIGH' | null;
  readonly volumeTolerance: 'HIGH' | 'MODERATE' | 'CONSERVATIVE' | null;
  readonly supervision: 'LOW' | 'MODERATE' | 'HIGH' | null;
  readonly checkIn: 'WEEKLY' | 'WEEKLY_OR_BIWEEKLY' | 'BIWEEKLY' | null;
  readonly topPriority: ProfileDomain | null;
}

export interface PerformanceProfile {
  /** Los puntos de 1 a 5 de cada pregunta respondida. */
  readonly points: Readonly<Partial<Record<ScoredQuestion, number>>>;
  /** De 0 a 100 por dominio; null si el dominio no tiene respuestas (P-10). */
  readonly domainScores: Readonly<Record<ProfileDomain, number | null>>;
  readonly pri: number | null;
  readonly classes: PerformanceClasses;
}

/** Corte de la hoja: 80 o más, 60 o más, menos. Sin dato, null (un dato que falta no es cero). */
const band = <H, M, L>(score: number | null, high: H, moderate: M, low: L): H | M | L | null => {
  if (score === null) return null;
  if (score >= 80) return high;
  return score >= 60 ? moderate : low;
};

const CHECK_IN_BY_RISK = {
  HIGH: 'WEEKLY',
  MODERATE: 'WEEKLY_OR_BIWEEKLY',
  LOW: 'BIWEEKLY',
} as const;

function classesOf(scores: Readonly<Record<ProfileDomain, number | null>>): PerformanceClasses {
  const { RECOVERY: recovery, AVAILABILITY: availability, EXPERIENCE: experience } = scores;
  const { ADHERENCE: adherence } = scores;
  const adherenceRisk = band(adherence, 'LOW', 'MODERATE', 'HIGH');
  const toleranceBase =
    recovery === null || availability === null || experience === null
      ? null
      : Math.min(recovery, availability, experience);
  const answered = PROFILE_DOMAINS.flatMap((domain) => {
    const score = scores[domain];
    return score === null ? [] : [{ domain, score }];
  });
  const lowest = answered.reduce<(typeof answered)[number] | null>(
    (current, entry) => (current === null || entry.score < current.score ? entry : current),
    null,
  );
  return {
    recoveryCapacity: band(recovery, 'HIGH', 'MODERATE', 'LOW'),
    availability: band(availability, 'HIGH', 'MODERATE', 'LIMITED'),
    experience: band(experience, 'ADVANCED', 'INTERMEDIATE', 'BASIC'),
    adherenceRisk,
    volumeTolerance: band(toleranceBase, 'HIGH', 'MODERATE', 'CONSERVATIVE'),
    supervision:
      experience === null || adherence === null
        ? null
        : band(Math.min(experience, adherence), 'LOW', 'MODERATE', 'HIGH'),
    checkIn: adherenceRisk === null ? null : CHECK_IN_BY_RISK[adherenceRisk],
    topPriority: lowest?.domain ?? null,
  };
}

/**
 * Perfil de rendimiento de la anamnesis de JV Fitness (RN-F16, 07 §12): cada dominio vale de 0 a 100 con sus preguntas
 * respondidas, y el PRI pondera solo los dominios respondidos (P-10). Orienta al coach: no prescribe solo.
 */
export const PRI_JV = defineMethod<{ readonly answers: PerformanceAnswers }, PerformanceProfile>({
  code: 'PRI_JV',
  version: '2.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['answers'],
  requiredSites: [],
  citation: 'JV Fitness, motor de scoring de la anamnesis integral V2 (libro de formularios, 2026)',
  validity: [],
  compute: ({ answers }) => {
    const points: Partial<Record<ScoredQuestion, number>> = {};
    const byDomain = new Map<ProfileDomain, number[]>();
    const issues: Issue[] = [];
    for (const code of SCORED_QUESTIONS) {
      const answer = answers[code];
      if (answer === undefined || answer === null) continue;
      const [domain, score] = QUESTIONS[code];
      const value = score(answer);
      if (value === null) {
        issues.push({
          rule: 'RN-F16',
          severity: 'ERROR',
          code: 'NC-ENG-405',
          message: `La respuesta de ${code} no es válida.`,
        });
        continue;
      }
      points[code] = value;
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), value]);
    }
    const domainScores = Object.fromEntries(
      PROFILE_DOMAINS.map((domain) => {
        const values = byDomain.get(domain);
        return [domain, values ? mean(values) * 20 : null];
      }),
    ) as Record<ProfileDomain, number | null>;
    const answeredDomains = PROFILE_DOMAINS.filter((domain) => domainScores[domain] !== null);
    const pri =
      answeredDomains.length === 0
        ? null
        : sum(answeredDomains.map((d) => (domainScores[d] ?? 0) * DOMAIN_WEIGHT_PCT[d])) /
          sum(answeredDomains.map((d) => DOMAIN_WEIGHT_PCT[d]));
    return { outputs: { points, domainScores, pri, classes: classesOf(domainScores) }, issues };
  },
});
