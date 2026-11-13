import {
  RECORD_DOCUMENT_CATEGORIES,
  RECORD_DOCUMENT_CATEGORY_LABELS,
  RECORD_DOCUMENT_STATUS_LABELS,
  type RecordDocument,
  type RecordDocumentCategory,
  type RecordDocumentStatus,
} from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';

/** De dónde sale cada archivo: el equipo y el alumno lo piden por rutas distintas, siempre por la API (ADR-038). */
export type DocumentAudience = 'staff' | 'patient';

export const documentFileUrl = (id: string, audience: DocumentAudience): string =>
  audience === 'staff'
    ? `/api/v1/record-documents/${id}/file`
    : `/api/v1/me/record-documents/${id}/file`;

/** Cada estado con su tono: pendiente avisa, por revisar informa y validado está bien (color, ícono y texto). */
export const STATUS_TONES: Readonly<Record<RecordDocumentStatus, Tone>> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  VALIDATED: 'success',
};

export const statusLabel = (status: RecordDocumentStatus): string =>
  RECORD_DOCUMENT_STATUS_LABELS[status];

export interface CategoryGroup {
  readonly category: RecordDocumentCategory;
  readonly label: string;
  readonly documents: readonly RecordDocument[];
}

/** Las 8 categorías de la hoja, en su orden, cada una con sus documentos (los más nuevos primero, como llegan). */
export function documentsByCategory(
  documents: readonly RecordDocument[],
): readonly CategoryGroup[] {
  return RECORD_DOCUMENT_CATEGORIES.map((category) => ({
    category,
    label: RECORD_DOCUMENT_CATEGORY_LABELS[category],
    documents: documents.filter((document) => document.category === category),
  }));
}

/** Lo que el alumno tiene que subir: lo que pidió su coach o le devolvió, arriba en su app. */
export const pendingDocuments = (documents: readonly RecordDocument[]): readonly RecordDocument[] =>
  documents.filter((document) => document.status === 'PENDING');

/** Lo demás, ya subido: por revisar o validado. */
export const uploadedDocuments = (
  documents: readonly RecordDocument[],
): readonly RecordDocument[] => documents.filter((document) => document.status !== 'PENDING');

/** El alumno borra solo lo que él subió mientras está por revisar (RN-G21); lo mismo decide la API. */
export const patientCanDelete = (document: RecordDocument): boolean =>
  document.createdByRole === 'PATIENT' && document.status === 'IN_REVIEW';

/** El alumno ya no cambia lo validado. */
export const patientCanReplace = (document: RecordDocument): boolean =>
  document.status !== 'VALIDATED';

const FILE_KINDS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
};

/** «PDF · 120 KB»: el tipo y el peso de un archivo, sin decimales de más (RN-D09 solo rige números clínicos). */
export function fileSummary(mimeType: string, sizeBytes: number): string {
  const kind = FILE_KINDS[mimeType] ?? 'Archivo';
  const size =
    sizeBytes >= 1_000_000
      ? `${(sizeBytes / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`
      : `${String(Math.max(1, Math.round(sizeBytes / 1000)))} KB`;
  return `${kind} · ${size}`;
}

/** El sitio de un enlace, para mostrar adónde lleva sin pegar la dirección entera. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 07, «Privacidad»: las fotos y los enlaces, donde van los videos, piden el consentimiento de imágenes; un PDF no. */
export const IMAGE_TYPES = 'image/jpeg,image/png';
export const PDF_TYPE = 'application/pdf';

/** Los archivos que se pueden elegir según los consentimientos: sin el de imágenes, solo PDF. */
export const acceptedFiles = (imagesConsent: boolean): string =>
  imagesConsent ? `${PDF_TYPE},${IMAGE_TYPES}` : PDF_TYPE;
