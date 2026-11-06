import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { mean, sum } from '../stats.js';
import { outOfRange } from './input-ranges.js';
import { srpeLoad } from './readiness.js';

/** Un día de la semana del macrociclo, como lo dejó el registro diario (RN-G11, 07 §10). null es «sin dato», nunca cero. */
export interface WeeklyReviewDay {
  /** Minutos de la sesión; 0 en un día sin sesión. */
  readonly sessionMinutes: number | null;
  /** De 0 a 10 (P-12). */
  readonly sessionRpe: number | null;
  readonly sleepHours: number | null;
  /** A mano en la 1.0: sin reloj. */
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
  /** De 1 a 5: 5 es el peor estado. */
  readonly fatigue: number | null;
  readonly soreness: number | null;
  /** El rendimiento del día que calculó `READINESS_JV`, con su tope de 120 %. */
  readonly performancePct: number | null;
  /** De 0 a 100, lo declara el asesorado. */
  readonly nutritionCompliancePct: number | null;
  /** De 0 a 3, solo con el consentimiento MENSTRUAL_TRACKING (RN-G17). */
  readonly menstrualSymptoms: number | null;
}

/** Los umbrales semanales vigentes de la organización (07 §11): datos versionados, no constantes del método. */
export interface WeeklyReviewThresholds {
  readonly performanceMinPct: number;
  readonly weeklySleepMinHours: number;
  readonly fatigueSorenessAmberAbove: number;
  readonly nutritionMinPct: number;
}

export interface WeeklyReviewInput {
  /** Los días de la semana con registro diario: de 0 a 7. */
  readonly days: readonly WeeklyReviewDay[];
  /** El factor de volumen de la semana en el macrociclo (07 §7). */
  readonly plannedVolumeFactor: number;
  readonly thresholds: WeeklyReviewThresholds;
}

/** Los agregados de la semana (07 §10). Un promedio sin ningún dato es null. */
export interface WeeklyAggregates {
  /** Días con duración mayor que 0. */
  readonly sessions: number;
  /** Suma de minutos × RPE de los días que tienen los dos; null si ninguno. */
  readonly srpeLoad: number | null;
  readonly avgSleepHours: number | null;
  readonly avgRestingHrBpm: number | null;
  readonly avgHrvMs: number | null;
  readonly avgFatigue: number | null;
  readonly avgSoreness: number | null;
  readonly avgPerformancePct: number | null;
  readonly avgNutritionCompliancePct: number | null;
  readonly avgMenstrualSymptoms: number | null;
}

/** Verde, ámbar, rojo y sin datos: «falta registro» (RN-G16). */
export const WEEKLY_LIGHTS = ['GREEN', 'AMBER', 'RED', 'NO_DATA'] as const;
export type WeeklyLight = (typeof WEEKLY_LIGHTS)[number];

/** Continuar el plan, ajustar 5–15 %, descarga 20–30 % y revisar, o falta registro (05.2, `suggested_action`). */
export const WEEKLY_ACTIONS = ['CONTINUE', 'ADJUST', 'DELOAD', 'MISSING_LOG'] as const;
export type WeeklyAction = (typeof WEEKLY_ACTIONS)[number];

/** Lo que encendió el semáforo, para que el coach vea por qué. */
export const WEEKLY_REASONS = [
  'PERFORMANCE',
  'SLEEP',
  'MENSTRUAL_SYMPTOMS',
  'FATIGUE',
  'SORENESS',
  'NUTRITION',
] as const;
export type WeeklyReason = (typeof WEEKLY_REASONS)[number];

export interface WeeklyDecision {
  readonly light: WeeklyLight;
  /** Las razones del color, en el orden de WEEKLY_REASONS; vacía en verde y sin datos. */
  readonly reasons: readonly WeeklyReason[];
  /** El factor del plan por 0.75 en rojo, por 0.90 en ámbar, igual en verde; null sin datos. */
  readonly suggestedVolumeFactor: number | null;
  readonly suggestedAction: WeeklyAction;
}

export interface WeeklyReview extends WeeklyDecision {
  readonly aggregates: WeeklyAggregates;
  readonly plannedVolumeFactor: number;
}

/** Constantes del método V3 (07 §10): cambian con su versión, no por organización (05.2). */
const RED_FACTOR = 0.75;
const AMBER_FACTOR = 0.9;
const RED_MENSTRUAL_SYMPTOMS_AVG = 2;
const DAYS_PER_WEEK = 7;
const MAX_VOLUME_FACTOR = 2;

/** Promedio de lo que tiene dato; null si nada lo tiene. */
const averageOf = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : mean(known);
};

/** Los agregados de la semana (07 §10): sesiones, carga sRPE y promedios sobre los días con dato. */
export function weeklyAggregates(days: readonly WeeklyReviewDay[]): WeeklyAggregates {
  const loads = days
    .map((day) => srpeLoad(day.sessionMinutes, day.sessionRpe))
    .filter((load): load is number => load !== null);
  return {
    sessions: days.filter((day) => day.sessionMinutes !== null && day.sessionMinutes > 0).length,
    srpeLoad: loads.length === 0 ? null : sum(loads),
    avgSleepHours: averageOf(days.map((day) => day.sleepHours)),
    avgRestingHrBpm: averageOf(days.map((day) => day.restingHrBpm)),
    avgHrvMs: averageOf(days.map((day) => day.hrvMs)),
    avgFatigue: averageOf(days.map((day) => day.fatigue)),
    avgSoreness: averageOf(days.map((day) => day.soreness)),
    avgPerformancePct: averageOf(days.map((day) => day.performancePct)),
    avgNutritionCompliancePct: averageOf(days.map((day) => day.nutritionCompliancePct)),
    avgMenstrualSymptoms: averageOf(days.map((day) => day.menstrualSymptoms)),
  };
}

/** Una condición que se cumple solo si hay dato: la falta de un dato no es mal estado (07, principios). */
const holds = (value: number | null, test: (known: number) => boolean): boolean =>
  value !== null && test(value);

/**
 * Semáforo de la semana en el orden de la V3 (RN-G16): sin sesiones, falta registro; rendimiento bajo el mínimo, sueño bajo
 * el mínimo o síntomas del ciclo con promedio de 2 o más, rojo; fatiga o dolor sobre el umbral o alimentación bajo el mínimo,
 * ámbar; si no, verde. Es una sugerencia: decide el coach (RN-F17).
 */
export function weeklyDecision(
  aggregates: WeeklyAggregates,
  plannedVolumeFactor: number,
  thresholds: WeeklyReviewThresholds,
): WeeklyDecision {
  if (aggregates.sessions === 0) {
    return {
      light: 'NO_DATA',
      reasons: [],
      suggestedVolumeFactor: null,
      suggestedAction: 'MISSING_LOG',
    };
  }
  const red: WeeklyReason[] = [];
  if (holds(aggregates.avgPerformancePct, (v) => v < thresholds.performanceMinPct)) {
    red.push('PERFORMANCE');
  }
  if (holds(aggregates.avgSleepHours, (v) => v < thresholds.weeklySleepMinHours)) {
    red.push('SLEEP');
  }
  if (holds(aggregates.avgMenstrualSymptoms, (v) => v >= RED_MENSTRUAL_SYMPTOMS_AVG)) {
    red.push('MENSTRUAL_SYMPTOMS');
  }
  if (red.length > 0) {
    return {
      light: 'RED',
      reasons: red,
      suggestedVolumeFactor: plannedVolumeFactor * RED_FACTOR,
      suggestedAction: 'DELOAD',
    };
  }
  const amber: WeeklyReason[] = [];
  if (holds(aggregates.avgFatigue, (v) => v > thresholds.fatigueSorenessAmberAbove)) {
    amber.push('FATIGUE');
  }
  if (holds(aggregates.avgSoreness, (v) => v > thresholds.fatigueSorenessAmberAbove)) {
    amber.push('SORENESS');
  }
  if (holds(aggregates.avgNutritionCompliancePct, (v) => v < thresholds.nutritionMinPct)) {
    amber.push('NUTRITION');
  }
  if (amber.length > 0) {
    return {
      light: 'AMBER',
      reasons: amber,
      suggestedVolumeFactor: plannedVolumeFactor * AMBER_FACTOR,
      suggestedAction: 'ADJUST',
    };
  }
  return {
    light: 'GREEN',
    reasons: [],
    suggestedVolumeFactor: plannedVolumeFactor,
    suggestedAction: 'CONTINUE',
  };
}

/** Los rangos de cada día (RN-G11, 05.2), la semana de 7 días, el factor de 07 §7 y umbrales de 07 §11. */
function inputIssues({ days, plannedVolumeFactor, thresholds }: WeeklyReviewInput): Issue[] {
  const dayIssue = { rule: 'RN-G16', severity: 'ERROR', code: 'NC-ENG-409' } as const;
  const issues: Issue[] = days.flatMap((day) =>
    outOfRange(
      [
        ['Los minutos de la sesión', day.sessionMinutes, [0, 600], true],
        ['El RPE de la sesión', day.sessionRpe, [0, 10]],
        ['Las horas de sueño', day.sleepHours, [0, 24]],
        ['La FC en reposo', day.restingHrBpm, [25, 220], true],
        ['La HRV', day.hrvMs, 'POSITIVE'],
        ['La fatiga', day.fatigue, [1, 5], true],
        ['El dolor muscular', day.soreness, [1, 5], true],
        ['El rendimiento del día', day.performancePct, [0, 120]],
        ['El cumplimiento de la alimentación', day.nutritionCompliancePct, [0, 100], true],
        ['Los síntomas del ciclo', day.menstrualSymptoms, [0, 3], true],
      ],
      dayIssue,
    ),
  );
  if (days.length > DAYS_PER_WEEK) {
    issues.push({ ...dayIssue, message: 'Una semana tiene 7 días como máximo.' });
  }
  const weekIssue = { rule: 'RN-G16', severity: 'ERROR', code: 'NC-ENG-410' } as const;
  if (
    !Number.isFinite(plannedVolumeFactor) ||
    plannedVolumeFactor <= 0 ||
    plannedVolumeFactor > MAX_VOLUME_FACTOR
  ) {
    issues.push({
      ...weekIssue,
      message: 'El factor del plan fuera de rango (mayor que 0 y hasta 2).',
    });
  }
  issues.push(
    ...outOfRange(
      [
        ['El rendimiento mínimo', thresholds.performanceMinPct, [0, 120]],
        ['El sueño mínimo semanal', thresholds.weeklySleepMinHours, [0, 24]],
        ['La fatiga o el dolor en ámbar', thresholds.fatigueSorenessAmberAbove, [1, 5]],
        ['La alimentación mínima', thresholds.nutritionMinPct, [0, 100]],
      ],
      weekIssue,
    ),
  );
  return issues;
}

/**
 * Control semanal de JV Fitness (RN-G16, 07 §10): los agregados de la semana, el semáforo con sus razones, el factor
 * ajustado y la decisión sugerida, con los umbrales vigentes de la organización. El coach decide (RN-F17).
 */
export const WEEKLY_REVIEW_JV = defineMethod<WeeklyReviewInput, WeeklyReview>({
  code: 'WEEKLY_REVIEW_JV',
  version: '3.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['days', 'plannedVolumeFactor', 'thresholds'],
  requiredSites: [],
  citation: 'JV Fitness, plantilla de periodización V3: hojas CONTROL SEMANAL y DASHBOARD (2026)',
  validity: [],
  compute: (input) => {
    const aggregates = weeklyAggregates(input.days);
    return {
      outputs: {
        aggregates,
        plannedVolumeFactor: input.plannedVolumeFactor,
        ...weeklyDecision(aggregates, input.plannedVolumeFactor, input.thresholds),
      },
      issues: inputIssues(input),
    };
  },
});
