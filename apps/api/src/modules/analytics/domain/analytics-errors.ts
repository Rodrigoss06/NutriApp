import { domainError } from '@nutricoach/shared-kernel';

/** Errores de la analítica (02 §7). */
export const RANGE_INVALID = domainError({
  code: 'NC-ANA-001',
  rule: 'RN-G09',
  message: 'El rango va de una fecha a otra igual o posterior, y abarca 371 días como máximo.',
});
