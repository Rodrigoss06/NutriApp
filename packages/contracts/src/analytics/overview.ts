import { z } from 'zod';

/**
 * RF-34 · las alertas del panel del profesional (ADR-086, ADR-093), en el orden en que se muestran. La API las calcula en la fecha
 * local de cada paciente (RN-G04) y las guarda en `analytics.patient_overview`; la próxima cita llega con la agenda (P15).
 */
export const OVERVIEW_ALERTS = [
  'NO_RECENT_LOGS',
  'LOW_ADHERENCE',
  'UNREAD_NOTES',
  'READINESS_RED',
  'READINESS_YELLOW',
  'WEEKLY_RED',
  'WEEKLY_AMBER',
  'PENDING_REVIEW',
] as const;
export type OverviewAlert = (typeof OVERVIEW_ALERTS)[number];

/** Sin registros en los 3 días que ya terminaron (ADR-086). */
export const NO_RECENT_LOGS_DAYS = 3;
/** Adherencia de 7 días baja: menor que 80 % (ADR-086, 07 §11). */
export const LOW_ADHERENCE_PCT = 80;
/** Cuántos pacientes con alertas devuelve una página, como máximo. */
export const OVERVIEW_MAX_LIMIT = 100;

/** GET /api/v1/analytics/overview?alert&limit: solo los pacientes con alguna alerta, de los que el equipo ve (RN-A05). */
export const overviewQuerySchema = z.object({
  alert: z.enum(OVERVIEW_ALERTS).optional(),
  limit: z.coerce.number().int().min(1).max(OVERVIEW_MAX_LIMIT).default(50),
});
export type OverviewQuery = z.input<typeof overviewQuerySchema>;

const count = z.int().nonnegative();

/** Un paciente del panel: sus alertas y los números con que se calcularon. Sin nombres: la web los pide a /patients (ADR-064). */
export const overviewPatientSchema = z.object({
  patientId: z.uuid(),
  alerts: z.array(z.enum(OVERVIEW_ALERTS)),
  lastLogDate: z.iso.date().nullable(),
  /** RN-G09 · días en rango ÷ días con meta de los 7 y los 30 días que terminaron ayer; null sin días con meta. */
  adherence7dPct: z.number().nullable(),
  adherence30dPct: z.number().nullable(),
  unreadNotes: count,
  lastEvaluationAt: z.iso.datetime().nullable(),
  /** El último peso del resumen diario de los últimos 30 días, con el ajuste del profesional (RN-G02). */
  lastWeightKg: z.number().nullable(),
  nextAppointmentAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type OverviewPatient = z.infer<typeof overviewPatientSchema>;

export const overviewResponseSchema = z.object({
  /** Los pacientes con cada alerta; un paciente cuenta en cada una de las suyas. */
  counts: z.record(z.enum(OVERVIEW_ALERTS), count),
  /** Los pacientes con alguna alerta (o con la pedida), aunque la página traiga menos. */
  total: count,
  /** Primero los de más alertas; a igual número, los que llevan más días sin registrar. */
  patients: z.array(overviewPatientSchema),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
