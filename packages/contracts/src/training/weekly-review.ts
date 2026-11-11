import { z } from 'zod';
import { upToDecimals } from '../decimals.js';

const isoDate = z.iso.date();
const amount = z.number().nullable();

export const WEEKLY_LIGHTS = ['GREEN', 'AMBER', 'RED', 'NO_DATA'] as const;
export const WEEKLY_ACTIONS = ['CONTINUE', 'ADJUST', 'DELOAD', 'MISSING_LOG'] as const;
export const COACH_DECISIONS = ['KEEP', 'ADJUST', 'DELOAD'] as const;
export const WEEKLY_REASONS = [
  'PERFORMANCE',
  'SLEEP',
  'MENSTRUAL_SYMPTOMS',
  'FATIGUE',
  'SORENESS',
  'NUTRITION',
] as const;

/** Lo que el semáforo muestra al coach, en español (07 §10). */
export const WEEKLY_ACTION_TEXTS: Readonly<Record<(typeof WEEKLY_ACTIONS)[number], string>> = {
  CONTINUE: 'Continuar plan',
  ADJUST: 'Ajustar 5–15 %',
  DELOAD: 'Descarga 20–30 % y revisar',
  MISSING_LOG: 'Falta registro',
};

export const WEEKLY_REASON_TEXTS: Readonly<Record<(typeof WEEKLY_REASONS)[number], string>> = {
  PERFORMANCE: 'Rendimiento bajo el mínimo',
  SLEEP: 'Sueño bajo el mínimo semanal',
  MENSTRUAL_SYMPTOMS: 'Síntomas del ciclo altos',
  FATIGUE: 'Fatiga alta',
  SORENESS: 'Dolor muscular alto',
  NUTRITION: 'Alimentación bajo el mínimo',
};

export const weeklyAggregatesSchema = z.object({
  sessions: z.int().nonnegative(),
  srpeLoad: amount,
  avgSleepHours: amount,
  avgRestingHrBpm: amount,
  avgHrvMs: amount,
  avgFatigue: amount,
  avgSoreness: amount,
  avgPerformancePct: amount,
  avgNutritionCompliancePct: amount,
  avgMenstrualSymptoms: amount,
});

/** Un control semanal (05.2 `training.weekly_review`): el resultado del motor con su método (RN-D01) y la decisión del coach (RN-F17). */
export const weeklyReviewSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  weekNo: z.int().positive(),
  weekStart: isoDate,
  weekEnd: isoDate,
  method: z.object({ code: z.string(), version: z.string() }),
  light: z.enum(WEEKLY_LIGHTS),
  reasons: z.array(z.enum(WEEKLY_REASONS)),
  /**
   * El estrés promedio de la semana, de 1 a 5, del registro diario. Solo informa: no entra en el semáforo ni en la decisión (P-25;
   * P14.5, PR 6a). Sin registros con estrés, null.
   */
  avgStress: z.number().min(1).max(5).nullable(),
  aggregates: weeklyAggregatesSchema.nullable(),
  plannedVolumeFactor: z.number(),
  suggestedVolumeFactor: amount,
  suggestedAction: z.enum(WEEKLY_ACTIONS),
  computedAt: z.iso.datetime(),
  decision: z
    .object({
      decision: z.enum(COACH_DECISIONS),
      volumeFactor: amount,
      note: z.string(),
      decidedBy: z.uuid(),
      decidedAt: z.iso.datetime(),
    })
    .nullable(),
  /** La versión nueva que creó la decisión, y si ya se publicó: la semana cambia solo entonces (RN-F12). */
  resultingProgram: z
    .object({
      programId: z.uuid(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']).nullable(),
    })
    .nullable(),
  supersededCount: z.int().nonnegative(),
});
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

export const weeklyReviewsResponseSchema = z.object({
  program: z
    .object({
      programId: z.uuid(),
      lineageId: z.uuid(),
      name: z.string(),
      totalWeeks: z.int().nonnegative(),
    })
    .nullable(),
  reviews: z.array(weeklyReviewSchema),
});
export type WeeklyReviewsResponse = z.infer<typeof weeklyReviewsResponseSchema>;

/** La decisión del coach (RN-F17): mantener, o ajustar o descargar con el factor de la semana siguiente, siempre con nota. */
export const decideWeeklyReviewSchema = z
  .strictObject({
    decision: z.enum(COACH_DECISIONS),
    volumeFactor: z
      .number()
      .gt(0, 'El factor es mayor que 0.')
      .max(2, 'El factor llega hasta 2.')
      .refine(upToDecimals(2), 'Usa hasta 2 decimales.')
      .nullable()
      .default(null),
    note: z.string().trim().min(1, 'Escribe la nota de la decisión.').max(1000),
  })
  .refine((body) => body.decision === 'KEEP' || body.volumeFactor !== null, {
    path: ['volumeFactor'],
    message: 'Para ajustar o descargar, indica el factor de la semana siguiente.',
  });
export type DecideWeeklyReview = z.infer<typeof decideWeeklyReviewSchema>;

export const weeklyReviewDecisionResponseSchema = z.object({
  reviewId: z.uuid(),
  draftProgramId: z.uuid().nullable(),
});
export type WeeklyReviewDecisionResponse = z.infer<typeof weeklyReviewDecisionResponseSchema>;
