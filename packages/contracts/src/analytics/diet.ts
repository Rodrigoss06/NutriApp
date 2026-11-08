import { z } from 'zod';

const isoDate = z.iso.date();
const amount = z.number().nullable();
const count = z.int().nonnegative();

/** RN-G09 · el rango de la analítica: hasta 53 semanas. */
export const ANALYTICS_MAX_DAYS = 371;
/** Sin rango, las últimas 4 semanas hasta hoy, en la fecha local del paciente (RN-G04). */
export const ANALYTICS_DEFAULT_DAYS = 28;

/** RN-I03: en cuántos registros del día falta cada nutriente, sobre el total de registros. */
export const nutrientsMissingSchema = z.object({
  items: count,
  kcal: count,
  choG: count,
  proteinG: count,
  fatG: count,
  fiberG: count,
});
export type NutrientsMissing = z.infer<typeof nutrientsMissingSchema>;

/**
 * Un día del resumen (05.3 `analytics.patient_daily_summary`), con los ajustes del profesional aplicados (RN-G02). Lo consumido es
 * la suma de lo conocido: si `nutrientsMissing` dice que falta, se muestra «al menos» (RN-I03). Sin registros, null: no es 0.
 */
export const dietDaySchema = z.object({
  localDate: isoDate,
  /** El tipo del día según el programa vigente (07 §8): su meta es la de ese tipo (07 §2). Sin programa, null. */
  dayKind: z.enum(['TRAINING', 'REST']).nullable(),
  kcal: amount,
  choG: amount,
  proteinG: amount,
  fatG: amount,
  fiberG: amount,
  targetKcal: amount,
  targetChoG: amount,
  targetProteinG: amount,
  targetFatG: amount,
  adequacyKcalPct: amount,
  adequacyChoPct: amount,
  adequacyProteinPct: amount,
  adequacyFatPct: amount,
  /** null sin meta, sin registros o con un dato faltante que no deja saberlo (RN-E10). */
  kcalInRange: z.boolean().nullable(),
  mealsLogged: count,
  mealsPlanned: count.nullable(),
  offPlanItems: count,
  waterMl: z.int().nullable(),
  waterTargetMl: z.int().nullable(),
  nutrientsMissing: nutrientsMissingSchema,
});
export type DietDay = z.infer<typeof dietDaySchema>;

/** Un nutriente en la semana: el promedio de los días con registros y meta, contra su meta, y si estuvo completo (RN-I03). */
export const dietWeekNutrientSchema = z.object({
  consumed: amount,
  target: amount,
  adequacyPct: amount,
  complete: z.boolean(),
});

/** La semana de lunes a domingo (RN-G09): promedio, adecuación y días en rango. */
export const dietWeekSchema = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  daysWithTarget: count,
  daysLogged: count,
  daysInRange: count,
  kcal: dietWeekNutrientSchema,
  choG: dietWeekNutrientSchema,
  proteinG: dietWeekNutrientSchema,
  fatG: dietWeekNutrientSchema,
});
export type DietWeek = z.infer<typeof dietWeekSchema>;

/** Adherencia por tiempo de comida (RF-32): días con registro sobre los días en que el plan lo tenía. */
export const mealSlotAdherenceSchema = z.object({
  slotCode: z.string(),
  plannedDays: count,
  loggedDays: count,
  adherencePct: amount,
  /** Días en que se registró en ese tiempo sin que el plan lo tuviera. */
  offPlanDays: count,
});
export type MealSlotAdherence = z.infer<typeof mealSlotAdherenceSchema>;

/** Analítica de dieta del paciente (RF-32), con el método de cada adecuación (RN-D02). */
export const dietAnalyticsSchema = z.object({
  from: isoDate,
  to: isoDate,
  adequacyRangePct: z.tuple([z.number(), z.number()]),
  method: z.object({ code: z.literal('ADEQUACY'), version: z.string() }),
  days: z.array(dietDaySchema),
  weeks: z.array(dietWeekSchema),
  mealSlots: z.array(mealSlotAdherenceSchema),
});
export type DietAnalytics = z.infer<typeof dietAnalyticsSchema>;
