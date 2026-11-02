import { domainError } from '@nutricoach/shared-kernel';

/** Errores de los registros del paciente (02 §7). La API responde 404 a lo que no existe y 422 a lo demás. */
export const FUTURE_DATE = domainError({
  code: 'NC-TRK-001',
  rule: 'RN-G10',
  message: 'No se registran días que todavía no llegan.',
});

export const WINDOW_CLOSED = domainError({
  code: 'NC-TRK-002',
  rule: 'RN-G10',
  message: 'Ese día ya está cerrado: se registra, corrige o anula solo en los últimos días.',
});

export const NO_ACTIVE_PLAN = domainError({
  code: 'NC-TRK-003',
  rule: 'RN-G05',
  message: 'Ese día no tenías este plan vigente: regístralo fuera del plan, desde el catálogo.',
});

export const NOT_IN_PLAN = domainError({
  code: 'NC-TRK-004',
  rule: 'RN-G05',
  message: 'Eso no está en tu plan.',
});

export const RECORD_NOT_FOUND = domainError({
  code: 'NC-TRK-005',
  message: 'Ese registro no existe.',
});

export const RECORD_VOIDED = domainError({
  code: 'NC-TRK-006',
  rule: 'RN-G12',
  message: 'Ese registro ya está anulado.',
});

export const WEIGHT_LOG_DISABLED = domainError({
  code: 'NC-TRK-007',
  message: 'Tu profesional no habilitó el registro del peso en tu app.',
});

export const FOOD_NOT_FOUND = domainError({
  code: 'NC-TRK-008',
  message: 'Ese alimento no está en el catálogo.',
});

export const METRIC_OUT_OF_RANGE = domainError({
  code: 'NC-TRK-009',
  rule: 'RN-C04',
  message: 'Ese valor está fuera del rango de la medida.',
});
