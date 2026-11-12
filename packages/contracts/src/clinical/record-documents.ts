import { z } from 'zod';

/**
 * El expediente de documentos del alumno (P14.5, PR 8; P-31; ADR-122): enlaces externos y archivos PDF, JPEG o PNG de hasta 5 MB
 * (ADR-038); los videos, siempre por enlace. Las 8 categorías fijas de la hoja piloto de JV Fitness.
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

export const RECORD_DOCUMENT_CATEGORY_LABELS = {
  ADMINISTRATIVE: 'Administrativo',
  CLINICAL: 'Clínico',
  PROGRESS: 'Progreso',
  APECS_EVALUATION: 'Evaluación APECS',
  TECHNIQUE: 'Técnica',
  FOLLOW_UP: 'Seguimiento',
  PHYSICAL_EVALUATIONS: 'Evaluaciones físicas',
  REPORT: 'Reporte',
} as const satisfies Record<RecordDocumentCategory, string>;

/** Pendiente → Por revisar → Validado (P-31): el coach pide, el alumno sube y el coach valida o lo devuelve. */
export const RECORD_DOCUMENT_STATUSES = ['PENDING', 'IN_REVIEW', 'VALIDATED'] as const;
export type RecordDocumentStatus = (typeof RECORD_DOCUMENT_STATUSES)[number];

export const RECORD_DOCUMENT_STATUS_LABELS = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'Por revisar',
  VALIDATED: 'Validado',
} as const satisfies Record<RecordDocumentStatus, string>;

/** Los archivos que admite el expediente, por sus bytes (ADR-038). */
export const RECORD_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const title = z.string().trim().min(1).max(120);
/** Un enlace externo: solo https, como la evidencia de 07 §4. La API nunca lo abre. */
const linkUrl = z.url({ protocol: /^https$/ }).max(2000);

/**
 * POST /api/v1/patients/:patientId/record-documents y POST /api/v1/me/record-documents: en JSON, o en multipart con el archivo en
 * el campo «file» y estos campos de texto. Sin enlace ni archivo, el coach pide el documento («Pendiente»); con uno de los dos, lo
 * que agrega el coach entra «Validado» y lo que sube el alumno, «Por revisar». El alumno siempre trae uno de los dos.
 */
export const addRecordDocumentSchema = z.strictObject({
  title,
  category: z.enum(RECORD_DOCUMENT_CATEGORIES),
  linkUrl: linkUrl.optional(),
});
export type AddRecordDocument = z.input<typeof addRecordDocumentSchema>;

/**
 * PUT /api/v1/record-documents/:id/content y PUT /api/v1/me/record-documents/:id/content, con If-Match: el contenido nuevo, el
 * enlace o el archivo en «file». El anterior se reemplaza y su archivo se borra.
 */
export const replaceRecordDocumentContentSchema = z.strictObject({
  linkUrl: linkUrl.optional(),
});
export type ReplaceRecordDocumentContent = z.input<typeof replaceRecordDocumentContentSchema>;

/** PUT /api/v1/record-documents/:id/review con If-Match: validar, o devolver a «Pendiente» con una nota para el alumno. */
export const reviewRecordDocumentSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('VALIDATE') }),
  z.strictObject({ decision: z.literal('RETURN'), note: z.string().trim().min(1).max(500) }),
]);
export type ReviewRecordDocument = z.input<typeof reviewRecordDocumentSchema>;

const actorRole = z.enum(['STAFF', 'PATIENT']);

export const recordDocumentSchema = z.object({
  id: z.string(),
  category: z.enum(RECORD_DOCUMENT_CATEGORIES),
  title: z.string(),
  status: z.enum(RECORD_DOCUMENT_STATUSES),
  /** Un pedido todavía sin contenido: null. */
  content: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('LINK'), url: z.string() }),
      z.object({
        kind: z.literal('FILE'),
        mimeType: z.enum(RECORD_DOCUMENT_MIME_TYPES),
        sizeBytes: z.int().nonnegative(),
      }),
    ])
    .nullable(),
  /** La nota del coach al devolverlo; se borra cuando llega contenido nuevo. */
  reviewNote: z.string().nullable(),
  createdByRole: actorRole,
  createdAt: z.iso.datetime(),
  contentByRole: actorRole.nullable(),
  contentAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  /** Para If-Match. */
  version: z.int().positive(),
});
export type RecordDocument = z.infer<typeof recordDocumentSchema>;

/** GET /api/v1/patients/:patientId/record-documents y GET /api/v1/me/record-documents. */
export const recordDocumentsResponseSchema = z.object({
  /**
   * Lo que pide subir (RN-B01 y 07, «Privacidad»): todo documento, el consentimiento de datos de salud; las fotos y los enlaces,
   * donde van los videos, también el de imágenes. Un PDF no lo pide.
   */
  consents: z.object({ healthData: z.boolean(), images: z.boolean() }),
  documents: z.array(recordDocumentSchema),
});
export type RecordDocumentsResponse = z.infer<typeof recordDocumentsResponseSchema>;

/** Lo que responden agregar, reemplazar y revisar. */
export const recordDocumentChangedSchema = z.object({
  id: z.string(),
  status: z.enum(RECORD_DOCUMENT_STATUSES),
  version: z.int().positive(),
});
export type RecordDocumentChanged = z.infer<typeof recordDocumentChangedSchema>;
