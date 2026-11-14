import { domainError } from '@nutricoach/shared-kernel';

export const ALREADY_MEMBER = domainError({
  code: 'NC-TEN-020',
  message: 'Esa persona ya es miembro de la organización.',
});
export const MEMBER_NOT_FOUND = domainError({ code: 'NC-TEN-021', message: 'No encontrado.' });
export const VERSION_CONFLICT = domainError({
  code: 'NC-TEN-022',
  message: 'Alguien cambió estos datos mientras los editabas. Vuelve a cargarlos.',
});
export const ORGANIZATION_NOT_FOUND = domainError({
  code: 'NC-TEN-023',
  message: 'No encontrado.',
});
export const PLAN_NOT_FOUND = domainError({
  code: 'NC-TEN-024',
  message: 'El plan de membresía no existe o está inactivo.',
});
export const SLUG_TAKEN = domainError({
  code: 'NC-TEN-025',
  message: 'Ese identificador de organización ya está en uso.',
});

export const PLAN_CODE_TAKEN = domainError({
  code: 'NC-TEN-045',
  message: 'Ya hay un plan con ese código.',
});
export const PLAN_UNKNOWN = domainError({
  code: 'NC-TEN-046',
  message: 'El plan de membresía no existe.',
});

export const SUPPORT_USER_NOT_FOUND = domainError({
  code: 'NC-TEN-047',
  rule: 'RN-A09',
  message: 'Esa persona no es del soporte de la plataforma.',
});
export const SUPPORT_GRANT_NOT_FOUND = domainError({
  code: 'NC-TEN-048',
  message: 'No encontrado.',
});
