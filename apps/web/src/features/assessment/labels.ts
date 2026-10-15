import type {
  BiaMetric,
  BiaUnit,
  EvaluationComparisonResponse,
  EvaluationLevel,
  EvaluationSummary,
  Interpretation,
  MeasurementSite,
  MethodPurpose,
  MetricCode,
  MetricUnit,
  UnavailableMethod,
} from '@nutricoach/contracts';
import type { NumberKind, Tone } from '@nutricoach/ui';

/** Textos de la evaluación y sus resultados (interfaz en español, regla 9). */
export const LEVEL_LABELS = {
  BASIC: 'Nivel básico',
  ISAK1: 'ISAK 1',
  ISAK2: 'ISAK 2',
} as const satisfies Record<EvaluationLevel, string>;

export const LEVEL_DESCRIPTIONS = {
  BASIC: 'Peso, talla, cintura y cadera',
  ISAK1: 'Perfil restringido',
  ISAK2: 'Perfil completo',
} as const satisfies Record<EvaluationLevel, string>;

export const KIND_LABELS = {
  ANTHROPOMETRY: 'Antropometría',
  BIA: 'Bioimpedancia',
  MIXED: 'Antropometría y bioimpedancia',
} as const satisfies Record<EvaluationSummary['kind'], string>;

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

export const FAMILY_LABELS = {
  BASIC: 'Medidas básicas',
  SKINFOLD: 'Pliegues',
  GIRTH: 'Perímetros',
  LENGTH: 'Longitudes y alturas',
  BREADTH: 'Diámetros',
} as const satisfies Record<MeasurementSite['family'], string>;

/** Nivel o tipo en una línea: «ISAK 2 · antropometría y bioimpedancia». */
export function evaluationTitle(evaluation: Pick<EvaluationSummary, 'kind' | 'level'>): string {
  if (evaluation.level === null) return KIND_LABELS[evaluation.kind];
  if (evaluation.kind === 'ANTHROPOMETRY') return LEVEL_LABELS[evaluation.level];
  return `${LEVEL_LABELS[evaluation.level]} · ${KIND_LABELS[evaluation.kind].toLowerCase()}`;
}

/** Cómo se muestra cada indicador (RN-D09, ADR-049): su clase de número y su unidad. */
export const METRIC_NUMBER_KINDS = {
  BMI: 'index',
  WAIST_HEIGHT_RATIO: 'waistRatio',
  WAIST_HIP_RATIO: 'waistRatio',
  SKINFOLD_SUM_MM: 'length',
  BODY_DENSITY: 'density',
  FAT_PCT: 'percent',
  FAT_MASS_KG: 'mass',
  FAT_FREE_MASS_KG: 'mass',
  BONE_MASS_KG: 'mass',
  RESIDUAL_MASS_KG: 'mass',
  MUSCLE_MASS_KG: 'mass',
  SKELETAL_MUSCLE_MASS_KG: 'mass',
  CORRECTED_ARM_GIRTH_CM: 'length',
  CORRECTED_THIGH_GIRTH_CM: 'length',
  CORRECTED_CALF_GIRTH_CM: 'length',
  BODY_SURFACE_AREA_M2: 'bodySurface',
  SKIN_MASS_KG: 'mass',
  ADIPOSE_MASS_KG: 'mass',
  HEAD_BONE_MASS_KG: 'mass',
  BODY_BONE_MASS_KG: 'mass',
  STRUCTURED_MASS_KG: 'mass',
  STRUCTURED_MASS_DIFF_PCT: 'percent',
  CORMIC_INDEX: 'index',
  MANOUVRIER_INDEX: 'index',
  ACROMIOILIAC_INDEX: 'index',
} as const satisfies Record<MetricCode, NumberKind>;

export const METRIC_UNIT_LABELS = {
  kg: 'kg',
  '%': '%',
  mm: 'mm',
  cm: 'cm',
  'g/mL': 'g/mL',
  'kg/m2': 'kg/m²',
  m2: 'm²',
  ratio: '',
  index: '',
} as const satisfies Record<MetricUnit, string>;

/** Medidas de un sitio: kg y cm con 1 decimal, como los pliegues en mm (RN-D09). */
export const SITE_NUMBER_KINDS = {
  kg: 'mass',
  cm: 'length',
  mm: 'length',
} as const satisfies Record<MeasurementSite['unit'], NumberKind>;

/** Tono de la interpretación: color, ícono y texto, nunca solo color. */
export const INTERPRETATION_TONES = {
  NEUTRAL: 'success',
  CAUTION: 'warning',
  RISK: 'danger',
} as const satisfies Record<Interpretation['tone'], Tone>;

export const PURPOSE_LABELS = {
  FAT_PCT: '% de grasa',
  MUSCLE: 'Masa muscular',
  BONE: 'Masa ósea',
  RMR: 'Tasa metabólica en reposo',
  ONE_RM: '1RM estimado',
} as const satisfies Record<MethodPurpose, string>;

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

/** Indicadores de la bioimpedancia (RN-C08, ⚠️ N19): el equipo les pone su propio nombre. */
export const BIA_METRIC_LABELS = {
  FAT_PCT: 'Grasa corporal',
  FAT_MASS: 'Masa grasa',
  FAT_FREE_MASS: 'Masa libre de grasa',
  MUSCLE_MASS: 'Masa muscular',
  TOTAL_BODY_WATER: 'Agua corporal total',
  VISCERAL_FAT: 'Grasa visceral',
  BMR: 'Metabolismo basal',
  PHASE_ANGLE: 'Ángulo de fase',
} as const satisfies Record<BiaMetric, string>;

export const BIA_UNIT_LABELS = {
  '%': '%',
  kg: 'kg',
  L: 'L',
  level: 'nivel',
  cm2: 'cm²',
  kcal: 'kcal',
  deg: '°',
} as const satisfies Record<BiaUnit, string>;

const readingFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** Un valor de la bioimpedancia tal como lo dio el equipo: es una lectura, no un cálculo. */
export function formatReading(value: number, unit: BiaUnit): string {
  const number = readingFormat.format(value);
  if (unit === 'deg') return `${number}°`;
  if (unit === 'level') return `${number} (nivel)`;
  return `${number} ${BIA_UNIT_LABELS[unit]}`;
}
