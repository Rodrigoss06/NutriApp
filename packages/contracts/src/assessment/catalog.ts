import { z } from 'zod';

/** Familias y unidades de assessment.measurement_site (05.1). */
export const SITE_FAMILIES = ['BASIC', 'SKINFOLD', 'GIRTH', 'LENGTH', 'BREADTH'] as const;
export const SITE_UNITS = ['kg', 'cm', 'mm'] as const;

/**
 * Niveles de evaluación (RN-C01): básico (peso, talla, cintura y cadera), ISAK 1 (perfil restringido, 21 medidas) e
 * ISAK 2 (perfil completo). ⚠️ El catálogo tiene 42 de las 43 medidas de ISAK 2: el noveno diámetro se agrega con
 * una migración de datos cuando se confirme con la guía de acreditación ISAK (2023).
 */
export const EVALUATION_LEVELS = ['BASIC', 'ISAK1', 'ISAK2'] as const;
export type EvaluationLevel = (typeof EVALUATION_LEVELS)[number];

/**
 * Sitio del catálogo global (GET /api/v1/measurement-sites). Los sitios son datos, no código (ADR-014): los rangos y
 * los niveles salen de aquí, también en la captura.
 */
export const measurementSiteSchema = z.object({
  code: z.string(),
  family: z.enum(SITE_FAMILIES),
  nameEs: z.string(),
  unit: z.enum(SITE_UNITS),
  /** Rango de rechazo (RN-C04): una toma fuera de él no se acepta. ⚠️ Provisional en perímetros, diámetros y longitudes. */
  minValue: z.number(),
  maxValue: z.number(),
  /** Diferencia relativa máxima entre la 1.ª y la 2.ª toma: 5 % en pliegues y 1 % en el resto (RN-C02). */
  tolerancePct: z.number(),
  minAttempts: z.number().int(),
  /** Niveles que exigen el sitio. Vacío: sitio extra, como los pliegues propios de Jackson y Pollock (RN-D04). */
  levels: z.array(z.enum(EVALUATION_LEVELS)),
  displayOrder: z.number().int(),
});
export type MeasurementSite = z.infer<typeof measurementSiteSchema>;

export const measurementSiteListResponseSchema = z.object({
  sites: z.array(measurementSiteSchema),
});
export type MeasurementSiteListResponse = z.infer<typeof measurementSiteListResponseSchema>;
