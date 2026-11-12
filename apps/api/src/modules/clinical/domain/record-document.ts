import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

/**
 * El expediente de documentos del alumno (P14.5, PR 8; P-31, respuestas de Rodrigo del 2026-11-10 y del 2026-11-12; RN-G21;
 * ADR-122). Las 8 categorías fijas de la hoja piloto y tres estados: el coach pide un documento sin contenido («Pendiente») o agrega
 * uno con su archivo o enlace («Validado»); el alumno completa un pedido o sube uno nuevo («Por revisar»), y el coach lo valida o lo
 * devuelve a «Pendiente» con una nota.
 */
export const RECORD_DOCUMENT_CATEGORIES = [
  'ADMINISTRATIVE',
  'CLINICAL',
  'PROGRESS',
  'APECS_EVALUATION',
  'TECHNIQUE',
  'FOLLOW_UP',
  'PHYSICAL_EVALUATIONS',
  'REPORT',
] as const;
export type RecordDocumentCategory = (typeof RECORD_DOCUMENT_CATEGORIES)[number];

export const RECORD_DOCUMENT_STATUSES = ['PENDING', 'IN_REVIEW', 'VALIDATED'] as const;
export type RecordDocumentStatus = (typeof RECORD_DOCUMENT_STATUSES)[number];

/** Quién actúa: un miembro del equipo desde el panel o el alumno desde su app. */
export type DocumentActor = 'STAFF' | 'PATIENT';

export type ReviewDecision = 'VALIDATE' | 'RETURN';

export interface RecordDocumentState {
  readonly status: RecordDocumentStatus;
  readonly createdByRole: DocumentActor;
}

/** El contenido de un documento: un enlace o un archivo con su tipo. */
export type DocumentContentKind =
  { readonly kind: 'LINK' } | { readonly kind: 'FILE'; readonly mimeType: string };

export const RECORD_DOCUMENT_NOT_FOUND = domainError({
  code: 'NC-CLI-034',
  rule: 'RN-A05',
  message: 'El documento no existe o no está en el expediente que ves.',
});
export const RECORD_DOCUMENT_CONTENT_REQUIRED = domainError({
  code: 'NC-CLI-035',
  rule: 'RN-G21',
  message: 'Agrega el enlace o el archivo del documento.',
});
export const RECORD_DOCUMENT_CONTENT_CONFLICT = domainError({
  code: 'NC-CLI-036',
  rule: 'RN-G21',
  message: 'Un documento lleva un enlace o un archivo, no los dos.',
});
export const RECORD_DOCUMENT_FILE_UNSUPPORTED = domainError({
  code: 'NC-CLI-037',
  rule: 'RN-G21',
  message:
    'El archivo tiene que ser un PDF, un JPEG o un PNG de hasta 5 MB. Los videos van por enlace.',
});
export const RECORD_DOCUMENT_LOCKED = domainError({
  code: 'NC-CLI-038',
  rule: 'RN-G21',
  message:
    'Este documento ya no se puede cambiar desde la app: está validado o lo agregó tu coach.',
});
export const RECORD_DOCUMENT_NOT_REVIEWABLE = domainError({
  code: 'NC-CLI-039',
  rule: 'RN-G21',
  message: 'Solo se valida o se devuelve un documento que está por revisar.',
});
export const RECORD_DOCUMENT_VERSION_CONFLICT = domainError({
  code: 'NC-CLI-040',
  rule: 'RN-G21',
  message: 'Alguien cambió este documento mientras lo veías: vuelve a cargarlo.',
});

/** Al agregar: el coach pide sin contenido o agrega con él, ya validado; el alumno siempre sube algo, para revisar. */
export function statusOnAdd(
  actor: DocumentActor,
  hasContent: boolean,
): Result<RecordDocumentStatus, DomainError> {
  if (actor === 'PATIENT')
    return hasContent ? ok('IN_REVIEW') : err(RECORD_DOCUMENT_CONTENT_REQUIRED);
  return ok(hasContent ? 'VALIDATED' : 'PENDING');
}

/**
 * Al poner contenido nuevo: el del coach queda validado; el alumno completa un pedido o reemplaza lo que está por revisar o le
 * devolvieron, y vuelve a revisión. Lo validado ya no lo cambia el alumno.
 */
export function statusOnContent(
  actor: DocumentActor,
  document: RecordDocumentState,
): Result<RecordDocumentStatus, DomainError> {
  if (actor === 'STAFF') return ok('VALIDATED');
  return document.status === 'VALIDATED' ? err(RECORD_DOCUMENT_LOCKED) : ok('IN_REVIEW');
}

/** Solo lo que está por revisar se valida o se devuelve a «Pendiente». */
export function statusOnReview(
  document: RecordDocumentState,
  decision: ReviewDecision,
): Result<RecordDocumentStatus, DomainError> {
  if (document.status !== 'IN_REVIEW') return err(RECORD_DOCUMENT_NOT_REVIEWABLE);
  return ok(decision === 'VALIDATE' ? 'VALIDATED' : 'PENDING');
}

/** El coach borra cualquiera; el alumno, solo los que él creó mientras están por revisar. */
export function canDeleteDocument(actor: DocumentActor, document: RecordDocumentState): boolean {
  return (
    actor === 'STAFF' || (document.createdByRole === 'PATIENT' && document.status === 'IN_REVIEW')
  );
}

/**
 * 07, «Privacidad»: fotos y videos con autorización previa, el consentimiento de imágenes (decisión de Rodrigo del 2026-11-12). Los
 * videos van por enlace, así que todo enlace la pide, como las fotos; un PDF solo pide el de datos de salud.
 */
export function needsImagesConsent(content: DocumentContentKind): boolean {
  return content.kind === 'LINK' || content.mimeType !== 'application/pdf';
}
