import type { EvaluationConditions } from './assessment-rules.js';

export type Significance = 'CHANGE' | 'NO_SIGNIFICANT_CHANGE' | 'UNKNOWN';
export type ConditionDifference = 'EVALUATOR' | 'FASTING' | 'INTENSE_ACTIVITY' | 'TIME_OF_DAY';

/** ⚠️ Horas de diferencia en la hora del día desde las que dos evaluaciones «difieren» (RN-C09, ADR-044). */
export const TIME_OF_DAY_TOLERANCE_MINUTES = 120;

/** Los seis pliegues de la suma de Yuhasz y Kerr: la suma de G-04. */
export const SKINFOLD_SUM6_SITES = [
  'SKF_TRICEPS',
  'SKF_SUBSCAPULAR',
  'SKF_SUPRASPINALE',
  'SKF_ABDOMINAL',
  'SKF_FRONT_THIGH',
  'SKF_MEDIAL_CALF',
] as const;

export interface ComparedEvaluation {
  readonly evaluatorMemberId: string;
  readonly conditions: EvaluationConditions;
  /** Minutos desde la medianoche en la zona del paciente. */
  readonly minutesOfDay: number;
}

/** Lo que cambió entre dos evaluaciones comparadas (RN-C09): se advierte, no se bloquea. */
export function conditionDifferences(
  current: ComparedEvaluation,
  previous: ComparedEvaluation,
): ConditionDifference[] {
  const gap = Math.abs(current.minutesOfDay - previous.minutesOfDay);
  const minutesApart = Math.min(gap, 24 * 60 - gap);
  return [
    ...(current.evaluatorMemberId === previous.evaluatorMemberId ? [] : (['EVALUATOR'] as const)),
    ...(current.conditions.fasting === previous.conditions.fasting ? [] : (['FASTING'] as const)),
    ...(current.conditions.intenseActivityLast24h === previous.conditions.intenseActivityLast24h
      ? []
      : (['INTENSE_ACTIVITY'] as const)),
    ...(minutesApart > TIME_OF_DAY_TOLERANCE_MINUTES ? (['TIME_OF_DAY'] as const) : []),
  ];
}

/** Un cambio menor o igual que el CMD95 es «sin cambio significativo» (RN-C06); sin ETM no se sabe. */
export function significance(delta: number, mdc95: number | null): Significance {
  if (mdc95 === null) return 'UNKNOWN';
  return Math.abs(delta) > mdc95 ? 'CHANGE' : 'NO_SIGNIFICANT_CHANGE';
}
