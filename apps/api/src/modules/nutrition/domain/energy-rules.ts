import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type EnergyStrategy = 'ADDITIVE' | 'FACTORIAL';
export type EnergyGoal = 'LOSE_FAT' | 'GAIN_MUSCLE' | 'MAINTAIN' | 'RECOMPOSITION' | 'PERFORMANCE';
export type RmrMethodCode =
  | 'RMR_MIFFLIN1990'
  | 'RMR_HB1919'
  | 'BMR_SCHOFIELD1985'
  | 'RMR_CUNNINGHAM1980'
  | 'RMR_KATCH_MCARDLE';

export const RMR_METHOD_CODES: readonly RmrMethodCode[] = [
  'RMR_MIFFLIN1990',
  'RMR_HB1919',
  'BMR_SCHOFIELD1985',
  'RMR_CUNNINGHAM1980',
  'RMR_KATCH_MCARDLE',
];

/** Ajuste por objetivo (RN-E04): en kcal por día o en kg de grasa por mes; negativo es déficit o pérdida. */
export type EnergyAdjustment =
  | { readonly kind: 'KCAL_PER_DAY'; readonly kcalPerDay: number }
  | { readonly kind: 'FAT_KG_PER_MONTH'; readonly fatKgPerMonth: number };

/**
 * BodyCompositionInput (02 §3): lo que nutrition toma de una evaluación, traducido a su propio lenguaje y citando el
 * método de la masa libre de grasa.
 */
export interface BodyCompositionInput {
  readonly evaluationId: string;
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
  readonly weightKg: number;
  readonly heightCm: number;
  readonly fatFreeMass: {
    readonly kg: number;
    readonly methodCode: string;
    readonly calculationResultId: string;
  } | null;
}

export const PRESCRIPTION_NOT_FOUND = domainError({
  code: 'NC-NUT-001',
  message: 'No encontramos esa prescripción.',
});
export const NO_CLOSED_EVALUATION = domainError({
  code: 'NC-NUT-002',
  rule: 'RN-E01',
  message: 'La prescripción necesita una evaluación cerrada del paciente con peso y talla.',
});
export const ACTIVITY_NOT_FOUND = (activityCode: string): DomainError =>
  domainError({
    code: 'NC-NUT-003',
    rule: 'RN-E03',
    message: `La actividad «${activityCode}» no está en el catálogo.`,
    details: { activityCode },
  });
/** Un ERROR del motor en algún componente: se devuelve con su regla y su código NC-ENG (RN-D06, RN-E02, RN-E07). */
export const ENERGY_RULE = (issue: {
  readonly rule: string;
  readonly code: string;
  readonly message: string;
  readonly methodCode: string;
}): DomainError =>
  domainError({
    code: 'NC-NUT-004',
    ...(/^RN-[A-Z]\d{2}$/.test(issue.rule) ? { rule: issue.rule as `RN-${string}` } : {}),
    message: issue.message,
    details: { methodCode: issue.methodCode, engineCode: issue.code },
  });
export const TARGET_NEEDS_FAT_FREE_MASS = domainError({
  code: 'NC-NUT-005',
  rule: 'RN-E06',
  message:
    'El peso objetivo usa la masa libre de grasa del método principal de % de grasa, que la evaluación no tiene.',
});
