import type { NumberKind } from '../presentation/format-number.js';
import type { EvaluationLevel, MeasurementSite } from './catalog.js';
import type { BiaMetric, BiaUnit, EvaluationSummary } from './evaluation.js';
import type { MethodPurpose, MetricCode, MetricUnit } from './results.js';

/**
 * Textos y formato de la evaluación y sus resultados (interfaz en español, regla 9): los usan el panel y la ficha PDF de
 * resultados, para que digan y redondeen lo mismo (RN-D09, ADR-064).
 */

export const LEVEL_LABELS = {
  BASIC: 'Nivel básico',
  ISAK1: 'ISAK 1',
  ISAK2: 'ISAK 2',
} as const satisfies Record<EvaluationLevel, string>;

export const KIND_LABELS = {
  ANTHROPOMETRY: 'Antropometría',
  BIA: 'Bioimpedancia',
  MIXED: 'Antropometría y bioimpedancia',
} as const satisfies Record<EvaluationSummary['kind'], string>;

export const FAMILY_LABELS = {
  BASIC: 'Medidas básicas',
  SKINFOLD: 'Pliegues',
  GIRTH: 'Perímetros',
  LENGTH: 'Longitudes y alturas',
  BREADTH: 'Diámetros',
} as const satisfies Record<MeasurementSite['family'], string>;

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

export const PURPOSE_LABELS = {
  FAT_PCT: '% de grasa',
  MUSCLE: 'Masa muscular',
  BONE: 'Masa ósea',
  RMR: 'Tasa metabólica en reposo',
  ONE_RM: '1RM estimado',
} as const satisfies Record<MethodPurpose, string>;

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
