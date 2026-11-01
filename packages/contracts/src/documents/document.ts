import { z } from 'zod';

/** Las cinco fichas PDF (RN-H01). */
export const SHEET_KINDS = [
  'EXCHANGE_DIET',
  'WEEKLY_MENU',
  'ANTHROPOMETRY',
  'EVOLUTION',
  'TRAINING',
] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** De dónde sale una ficha (RN-H02): un plan o un programa publicado, o una evaluación cerrada. */
export const DOCUMENT_SOURCE_TYPES = ['NUTRITION_PLAN', 'EVALUATION', 'TRAINING_PROGRAM'] as const;
export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];

/** POST /patients/:patientId/documents y GET …/documents/status: el origen de la ficha. */
export const documentSourceSchema = z.object({
  sourceType: z.enum(DOCUMENT_SOURCE_TYPES),
  sourceId: z.uuid(),
});
export type DocumentSource = z.infer<typeof documentSourceSchema>;

export const generatedDocumentSchema = z.object({
  id: z.uuid(),
  kind: z.enum(SHEET_KINDS),
  sourceType: z.enum(DOCUMENT_SOURCE_TYPES),
  sourceId: z.uuid(),
  templateVersion: z.string(),
  /** SHA-256 del PDF en hexadecimal: regenerar la misma ficha da el mismo (RN-H02). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  generatedAt: z.iso.datetime({ offset: true }),
  fileName: z.string(),
});
export type GeneratedDocument = z.infer<typeof generatedDocumentSchema>;

/** La ficha lista para descargar, o en la cola del worker: el panel vuelve a preguntar hasta que esté. */
export const documentStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('READY'), document: generatedDocumentSchema }),
  z.object({ status: z.literal('PENDING') }),
]);
export type DocumentStatusResponse = z.infer<typeof documentStatusSchema>;
