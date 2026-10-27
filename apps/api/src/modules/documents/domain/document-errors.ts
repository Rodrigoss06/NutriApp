import { domainError } from '@nutricoach/shared-kernel';

/** La ficha o su origen no existen, o son de otra organización o de un paciente que no se ve (RN-A01, RN-A05). */
export const DOCUMENT_NOT_FOUND = domainError({
  code: 'NC-DOC-001',
  message: 'No encontramos esa ficha.',
});

/** Una ficha sale de un plan publicado o de una evaluación cerrada (RN-H02): un borrador no tiene. */
export const SOURCE_NOT_PUBLISHED = domainError({
  code: 'NC-DOC-002',
  rule: 'RN-H02',
  message: 'Esa ficha sale de un plan publicado o de una evaluación cerrada.',
});

/** La evaluación está cerrada pero el worker todavía calcula sus resultados: la ficha sale cuando terminen (RN-D01). */
export const SOURCE_NOT_READY = domainError({
  code: 'NC-DOC-003',
  message:
    'Los resultados de esa evaluación todavía se están calculando: inténtalo en unos segundos.',
});
