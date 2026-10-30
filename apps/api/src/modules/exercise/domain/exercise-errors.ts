import { domainError } from '@nutricoach/shared-kernel';

/** El ejercicio no existe o es de otra organización: para ella no existe (RN-A01). */
export const EXERCISE_NOT_FOUND = domainError({
  code: 'NC-EXE-002',
  message: 'No encontramos ese ejercicio.',
});

/** La biblioteca global es de solo lectura para las organizaciones (RN-I01). */
export const GLOBAL_EXERCISE_READ_ONLY = domainError({
  code: 'NC-EXE-003',
  rule: 'RN-I01',
  message: 'Los ejercicios de referencia no se editan: crea uno propio.',
});

/** Alguien editó el ejercicio antes (If-Match). */
export const EXERCISE_VERSION_CONFLICT = domainError({
  code: 'NC-EXE-004',
  message: 'El ejercicio cambió mientras lo editabas: vuelve a abrirlo.',
});

/** La tabla patrón × nivel solo admite un ejercicio activo de ese patrón (RN-F14, 07 §5). */
export const CHOICE_EXERCISE_INVALID = domainError({
  code: 'NC-EXE-006',
  rule: 'RN-F14',
  message: 'Elige un ejercicio activo de ese patrón de movimiento.',
});
