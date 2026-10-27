import {
  KIND_LABELS,
  LEVEL_LABELS,
  type EvaluationComparisonResponse,
  type EvaluationLevel,
  type EvaluationSummary,
  type Interpretation,
  type UnavailableMethod,
} from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';

/** Textos de la evaluación y sus resultados (interfaz en español, regla 9); los compartidos con la ficha PDF, de contracts. */
export {
  BIA_METRIC_LABELS,
  BIA_UNIT_LABELS,
  FAMILY_LABELS,
  formatReading,
  KIND_LABELS,
  LEVEL_LABELS,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  PURPOSE_LABELS,
  SITE_NUMBER_KINDS,
} from '@nutricoach/contracts';

export const LEVEL_DESCRIPTIONS = {
  BASIC: 'Peso, talla, cintura y cadera',
  ISAK1: 'Perfil restringido',
  ISAK2: 'Perfil completo',
} as const satisfies Record<EvaluationLevel, string>;

export const STATUS_LABELS = {
  DRAFT: 'Borrador',
  CLOSED: 'Cerrada',
  AMENDED: 'Enmendada',
} as const satisfies Record<EvaluationSummary['status'], string>;

export const STATUS_TONES = {
  DRAFT: 'warning',
  CLOSED: 'success',
  AMENDED: 'info',
} as const satisfies Record<EvaluationSummary['status'], Tone>;

/** Nivel o tipo en una línea: «ISAK 2 · antropometría y bioimpedancia». */
export function evaluationTitle(evaluation: Pick<EvaluationSummary, 'kind' | 'level'>): string {
  if (evaluation.level === null) return KIND_LABELS[evaluation.kind];
  if (evaluation.kind === 'ANTHROPOMETRY') return LEVEL_LABELS[evaluation.level];
  return `${LEVEL_LABELS[evaluation.level]} · ${KIND_LABELS[evaluation.kind].toLowerCase()}`;
}

/** Tono de la interpretación: color, ícono y texto, nunca solo color. */
export const INTERPRETATION_TONES = {
  NEUTRAL: 'success',
  CAUTION: 'warning',
  RISK: 'danger',
} as const satisfies Record<Interpretation['tone'], Tone>;

export const PREFERENCE_SOURCE_LABELS = {
  PLATFORM: 'Por defecto',
  ORGANIZATION: 'De la organización',
  PATIENT: 'Elegido para este paciente',
} as const;

/** Por qué un método no se calculó (RN-C01, RN-D04 a RN-D06). */
export function unavailableReason(
  method: UnavailableMethod,
  siteName: (code: string) => string,
): string {
  switch (method.reason) {
    case 'MISSING_SITES':
      return `Faltan ${method.missingSites.map((code) => siteName(code).toLowerCase()).join(', ')}.`;
    case 'LEVEL':
      return 'Necesita un nivel de evaluación más completo (RN-C01).';
    case 'POPULATION':
      return 'No se usa por defecto en esta población.';
    case 'VALIDITY':
      return method.issues.map((issue) => issue.message).join(' ') || 'Fuera de su validez.';
    case 'DEPENDENCY':
      return 'Necesita el % de grasa del método principal, que no se calculó.';
  }
}

export const SIGNIFICANCE_LABELS = {
  CHANGE: 'Cambio real',
  NO_SIGNIFICANT_CHANGE: 'Sin cambio significativo',
  UNKNOWN: 'Sin ETM: no se puede saber',
} as const satisfies Record<EvaluationComparisonResponse['sites'][number]['significance'], string>;

export const SIGNIFICANCE_TONES = {
  CHANGE: 'success',
  NO_SIGNIFICANT_CHANGE: 'info',
  UNKNOWN: 'warning',
} as const satisfies Record<EvaluationComparisonResponse['sites'][number]['significance'], Tone>;

export const CONDITION_DIFFERENCE_LABELS = {
  EVALUATOR: 'otro evaluador',
  FASTING: 'distinto ayuno',
  INTENSE_ACTIVITY: 'distinta actividad intensa previa',
  TIME_OF_DAY: 'más de 2 horas de diferencia en la hora del día',
} as const satisfies Record<EvaluationComparisonResponse['conditionDifferences'][number], string>;
