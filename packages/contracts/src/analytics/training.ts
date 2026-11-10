import { z } from 'zod';

const isoDate = z.iso.date();
const amount = z.number().nullable();
const count = z.int().nonnegative();
const methodRef = z.object({ code: z.string(), version: z.string() });

/** Un grupo muscular en una semana (05.3 `analytics.patient_weekly_muscle_volume`): series fraccionadas contra lo programado (RN-F06). */
export const trainingMuscleWeekSchema = z.object({
  muscleCode: z.string(),
  setsPlanned: amount,
  setsDone: z.number().nonnegative(),
  /** RN-F09: realizado ÷ programado × 100; 0 sin programación. */
  compliancePct: z.number(),
  /** El tonelaje de sus series, principal al 100 % y secundario al 50 % (ADR-088). */
  tonnageKg: amount,
  /** El volumen ajustado de sus series con factor, repartido igual (P-26, ADR-106). */
  adjustedVolumeKg: amount,
  /** Las series del grupo con carga que quedaron «sin factor»: no suman al ajustado. */
  unfactoredSets: count.nullable(),
  avgRpe: amount,
  avgStimulus: amount,
  avgFatigue: amount,
  /** Heurística (RN-F07). */
  sfr: amount,
});
export type TrainingMuscleWeek = z.infer<typeof trainingMuscleWeekSchema>;

/** Una semana del macrociclo (RN-F01, RN-F08): lo programado y, si ya empezó, lo hecho. */
export const trainingWeekSchema = z.object({
  weekNo: z.int().positive(),
  weekStart: isoDate,
  weekEnd: isoDate,
  mesocycleId: z.string(),
  isDeload: z.boolean(),
  phase: z.string().nullable(),
  volumeFactor: amount,
  targetRir: z.int().nullable(),
  /** false para las semanas que todavía no empiezan: lo hecho queda en null. */
  started: z.boolean(),
  sessionsPlanned: count,
  sessionsDone: count.nullable(),
  sessionsCompliancePct: amount,
  tonnageKg: amount,
  /** Volumen × factor RIR × factor descanso de las series con factor (P-26, ADR-106). */
  adjustedVolumeKg: amount,
  /** Las series con carga que quedaron «sin factor». */
  unfactoredSets: count.nullable(),
  srpeLoad: amount,
  cardioMinutesPlanned: z.number().nonnegative(),
  cardioMinutesDone: amount,
  cardioCompliancePct: amount,
  muscles: z.array(trainingMuscleWeekSchema),
});
export type TrainingWeek = z.infer<typeof trainingWeekSchema>;

export const trainingMesocycleSchema = z.object({
  id: z.string(),
  position: z.int(),
  name: z.string(),
  focus: z.string().nullable(),
});

/** El 1RM estimado de un ejercicio en el tiempo, con su fórmula (RN-F04); fórmulas distintas no comparten serie (RN-D03). */
export const oneRmSeriesSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  formula: z.string(),
  method: methodRef.nullable(),
  points: z.array(z.object({ localDate: isoDate, estimated1rmKg: z.number() })),
});
export type OneRmSeries = z.infer<typeof oneRmSeriesSchema>;

/** La analítica de rutina del paciente (RF-33), agrupada por mesociclo, con el método de cada número (RN-D02). */
export const trainingAnalyticsSchema = z.object({
  program: z
    .object({
      programId: z.string(),
      lineageId: z.string(),
      name: z.string(),
      startDate: isoDate,
      endDate: isoDate,
      totalWeeks: count,
      oneRmFormula: z.string(),
    })
    .nullable(),
  methods: z.object({
    tonnage: methodRef,
    adjustedVolume: methodRef,
    fractionalSets: methodRef,
    compliance: methodRef,
    sfr: methodRef,
    rpe: methodRef,
    srpe: methodRef,
  }),
  mesocycles: z.array(trainingMesocycleSchema),
  weeks: z.array(trainingWeekSchema),
  oneRm: z.array(oneRmSeriesSchema),
});
export type TrainingAnalytics = z.infer<typeof trainingAnalyticsSchema>;
