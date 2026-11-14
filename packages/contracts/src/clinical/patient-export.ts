import { z } from 'zod';

/**
 * La exportación del paciente (RF-07, RN-B04; ADR-124, ADR-131): un ZIP con sus datos en JSON y CSV, sus fichas en PDF y sus archivos.
 * La piden el responsable, el dueño o el propio paciente; el worker la arma y queda 24 horas para descargarla, solo quien la pidió.
 */
export const PATIENT_EXPORT_STATUSES = ['PENDING', 'READY', 'EXPIRED', 'FAILED'] as const;
export type PatientExportStatus = (typeof PATIENT_EXPORT_STATUSES)[number];

export const PATIENT_EXPORT_STATUS_LABELS = {
  PENDING: 'Preparándose',
  READY: 'Lista para descargar',
  EXPIRED: 'Venció',
  FAILED: 'No se pudo preparar',
} as const satisfies Record<PatientExportStatus, string>;

/** Las horas que queda el ZIP para descargarlo, desde que está listo. */
export const PATIENT_EXPORT_TTL_HOURS = 24;

export const patientExportSchema = z.object({
  id: z.uuid(),
  status: z.enum(PATIENT_EXPORT_STATUSES),
  createdAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  /** Hasta cuándo se descarga: solo si está lista o venció. */
  expiresAt: z.iso.datetime().nullable(),
  sizeBytes: z.number().int().positive().nullable(),
});
export type PatientExport = z.infer<typeof patientExportSchema>;

/**
 * GET /api/v1/patients/:id/exports y GET /api/v1/me/exports: las que pidió quien pregunta en los últimos 7 días, de la más reciente a
 * la más antigua.
 */
export const patientExportListResponseSchema = z.object({ exports: z.array(patientExportSchema) });
export type PatientExportListResponse = z.infer<typeof patientExportListResponseSchema>;
