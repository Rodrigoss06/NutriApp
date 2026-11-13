import { z } from 'zod';

/**
 * Banderas de funcionalidad por organización (RF-39; ADR-124, ADR-127): un catálogo cerrado en el código. Las primeras son las tres
 * de la fase C de la hoja piloto, encendidas por defecto: una organización nueva puede no tenerlas.
 */
export const FEATURE_FLAGS = ['MESOCYCLE_REPORT', 'PROGRESS_PHOTOS', 'RECORD_DOCUMENTS'] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const FEATURE_FLAG_DEFAULTS = {
  MESOCYCLE_REPORT: true,
  PROGRESS_PHOTOS: true,
  RECORD_DOCUMENTS: true,
} as const satisfies Record<FeatureFlag, boolean>;

export const FEATURE_FLAG_LABELS = {
  MESOCYCLE_REPORT: 'Informe del mesociclo',
  PROGRESS_PHOTOS: 'Fotos de progreso',
  RECORD_DOCUMENTS: 'Expediente de documentos',
} as const satisfies Record<FeatureFlag, string>;

/** Las banderas vigentes de la organización: lo que la web muestra y la API acepta. */
export const featuresSchema = z.object({
  MESOCYCLE_REPORT: z.boolean(),
  PROGRESS_PHOTOS: z.boolean(),
  RECORD_DOCUMENTS: z.boolean(),
});
export type Features = z.infer<typeof featuresSchema>;

/** GET /api/v1/platform/organizations/:id/flags: cada bandera con su valor y si lo fijó la plataforma o es el de fábrica. */
export const platformFeatureFlagsResponseSchema = z.object({
  flags: z.array(
    z.object({
      key: z.enum(FEATURE_FLAGS),
      enabled: z.boolean(),
      source: z.enum(['ORGANIZATION', 'DEFAULT']),
    }),
  ),
});
export type PlatformFeatureFlagsResponse = z.infer<typeof platformFeatureFlagsResponseSchema>;

/** PUT /api/v1/platform/organizations/:id/flags/:key. */
export const setFeatureFlagSchema = z.strictObject({ enabled: z.boolean() });
export type SetFeatureFlag = z.infer<typeof setFeatureFlagSchema>;
