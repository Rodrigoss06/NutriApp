import { z } from 'zod';

/** Las tres vistas de cada mesociclo (P-30): frontal, lateral y posterior. */
export const PHOTO_VIEWS = ['FRONT', 'SIDE', 'BACK'] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export const PHOTO_VIEW_LABELS = {
  FRONT: 'Frontal',
  SIDE: 'Lateral',
  BACK: 'Posterior',
} as const satisfies Record<PhotoView, string>;

const isoDate = z.iso.date();

/**
 * GET /patients/:id/progress-photos y GET /me/progress-photos (RN-G20): los mesociclos de cada programa con fotos y del publicado,
 * con si ya se suben sus fotos, y las fotos de cada mesociclo y vista. Con el consentimiento revocado o el alumno archivado, sin
 * fotos. Los bytes se piden por separado, cada vez auditados.
 */
export const progressPhotosResponseSchema = z.object({
  consentActive: z.boolean(),
  programs: z.array(
    z.object({
      lineageId: z.uuid(),
      name: z.string(),
      current: z.boolean(),
      mesocycles: z.array(
        z.object({
          position: z.int().positive(),
          name: z.string(),
          startDate: isoDate,
          endDate: isoDate,
          open: z.boolean(),
        }),
      ),
    }),
  ),
  photos: z.array(
    z.object({
      id: z.uuid(),
      programLineageId: z.uuid(),
      mesocyclePosition: z.int().positive(),
      view: z.enum(PHOTO_VIEWS),
      uploadedByRole: z.enum(['PATIENT', 'STAFF']),
      uploadedAt: z.iso.datetime(),
    }),
  ),
});
export type ProgressPhotosResponse = z.infer<typeof progressPhotosResponseSchema>;

/** POST .../progress-photos/:position/:view, multipart con el campo «photo»: la foto subida o reemplazada. */
export const progressPhotoUploadResponseSchema = z.object({ id: z.uuid() });
export type ProgressPhotoUploadResponse = z.infer<typeof progressPhotoUploadResponseSchema>;
