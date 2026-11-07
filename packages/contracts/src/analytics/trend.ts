import { z } from 'zod';
import { dietWeekNutrientSchema } from './diet.js';

const isoDate = z.iso.date();
const count = z.int().nonnegative();

/** RN-G09 · la tendencia por mes: hasta 24 meses calendario. */
export const TREND_MAX_MONTHS = 24;
/** Sin rango, el mes actual y los 11 anteriores, en la fecha local del paciente (RN-G04). */
export const TREND_DEFAULT_MONTHS = 12;

/** Un mes calendario: la energía del promedio contra la meta, los días en rango y las sesiones (RN-G09, ADR-091). */
export const trendMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  daysWithTarget: count,
  daysLogged: count,
  daysInRange: count,
  kcal: dietWeekNutrientSchema,
  sessionsDone: count,
  /** null si ningún día del mes tuvo meta de entrenamiento: no es 0. */
  sessionsPlanned: count.nullable(),
});
export type TrendMonth = z.infer<typeof trendMonthSchema>;

/**
 * GET /api/v1/patients/:id/analytics/trend?from&to (RN-G09): la tercera agregación de la analítica, por mes calendario, para
 * leerla frente a la evolución antropométrica. La adecuación lleva su método (RN-D02).
 */
export const dietTrendSchema = z.object({
  from: isoDate,
  to: isoDate,
  adequacyRangePct: z.tuple([z.number(), z.number()]),
  method: z.object({ code: z.literal('ADEQUACY'), version: z.string() }),
  months: z.array(trendMonthSchema),
});
export type DietTrend = z.infer<typeof dietTrendSchema>;
