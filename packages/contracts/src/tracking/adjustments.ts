import { z } from 'zod';
import {
  checkinSchema,
  dayTotalsSchema,
  foodLogSchema,
  hydrationLogSchema,
  metricLogSchema,
  noteLogSchema,
  RECORD_STATUSES,
  workoutLogSchema,
} from './records.js';

const isoDate = z.iso.date();
const decimals = (digits: number) =>
  [
    (value: number) => Number.isInteger(Math.round(value * 10 ** digits * 1e6) / 1e6),
    `Usa hasta ${String(digits)} ${digits === 1 ? 'decimal' : 'decimales'}.`,
  ] as const;

/** Los registros que el profesional ajusta (05.2, tracking.log_adjustment). */
export const ADJUSTMENT_TARGETS = [
  'FOOD',
  'HYDRATION',
  'WORKOUT',
  'SET',
  'CHECKIN',
  'METRIC',
] as const;
export type AdjustmentTarget = (typeof ADJUSTMENT_TARGETS)[number];
export const ADJUSTMENT_ACTIONS = ['EXCLUDE', 'CORRECT'] as const;
export type AdjustmentAction = (typeof ADJUSTMENT_ACTIONS)[number];

export const ADJUSTMENT_TARGET_LABELS: Readonly<Record<AdjustmentTarget, string>> = {
  FOOD: 'Comida',
  HYDRATION: 'Agua',
  WORKOUT: 'Sesión',
  SET: 'Serie',
  CHECKIN: 'Registro diario',
  METRIC: 'Peso',
};

/**
 * Lo que se corrige de cada tipo (ADR-085): de una comida, la cantidad (gramos o porciones, como se registró), y sus nutrientes
 * se escalan en proporción; del agua, los ml; del peso, el valor; de una serie, las repeticiones y el peso; de una sesión, la
 * duración y el RPE. El registro diario solo se excluye: corregirlo obligaría a recalcular la recuperación.
 */
export const CORRECTABLE_FIELDS = {
  FOOD: ['grams', 'servings'],
  HYDRATION: ['volumeMl'],
  METRIC: ['value'],
  SET: ['reps', 'loadKg'],
  WORKOUT: ['durationMinutes', 'sessionRpe'],
  CHECKIN: [],
} as const satisfies Record<AdjustmentTarget, readonly string[]>;

export const correctionSchema = z.strictObject({
  grams: z
    .number()
    .positive()
    .max(5_000)
    .refine(...decimals(1))
    .optional(),
  servings: z
    .number()
    .positive()
    .max(50)
    .refine(...decimals(2))
    .optional(),
  volumeMl: z.number().int().min(1).max(5_000).optional(),
  value: z
    .number()
    .refine(...decimals(2))
    .optional(),
  reps: z.number().int().min(0).max(600).optional(),
  loadKg: z
    .number()
    .min(0)
    .max(9_999)
    .refine(...decimals(2))
    .optional(),
  durationMinutes: z.number().int().min(0).max(600).optional(),
  sessionRpe: z
    .number()
    .min(0)
    .max(10)
    .refine(...decimals(1))
    .optional(),
});
export type Correction = z.infer<typeof correctionSchema>;

/**
 * POST /api/v1/patients/:id/record-adjustments: el profesional corrige un registro del paciente con un ajuste que guarda autor y
 * motivo (RN-G02). El registro original se conserva; el ajuste más reciente de cada registro es el que vale.
 */
export const adjustRecordSchema = z
  .strictObject({
    targetType: z.enum(ADJUSTMENT_TARGETS),
    targetId: z.uuid(),
    targetLocalDate: isoDate,
    action: z.enum(ADJUSTMENT_ACTIONS),
    correctedValues: correctionSchema.nullable().default(null),
    reason: z.string().trim().min(10, 'Escribe el motivo, de 10 caracteres o más.').max(2_000),
  })
  .superRefine((input, context) => {
    const given = Object.keys(input.correctedValues ?? {});
    if (input.action === 'EXCLUDE') {
      if (input.correctedValues !== null) {
        context.addIssue({
          code: 'custom',
          path: ['correctedValues'],
          message: 'Excluir no lleva valores corregidos.',
        });
      }
      return;
    }
    const allowed: readonly string[] = CORRECTABLE_FIELDS[input.targetType];
    if (allowed.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['action'],
        message: 'El registro diario solo se excluye.',
      });
    } else if (given.length === 0 || given.some((field) => !allowed.includes(field))) {
      context.addIssue({
        code: 'custom',
        path: ['correctedValues'],
        message: `Corrige ${allowed.join(' o ')}.`,
      });
    } else if (input.targetType === 'FOOD' && given.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['correctedValues'],
        message: 'Corrige los gramos o las porciones, como se registró.',
      });
    }
  });
export type AdjustRecord = z.input<typeof adjustRecordSchema>;

export const recordAdjustmentSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(ADJUSTMENT_TARGETS),
  targetId: z.uuid(),
  targetLocalDate: isoDate,
  action: z.enum(ADJUSTMENT_ACTIONS),
  /** Lo corregido y lo que se deriva de ello: los nutrientes en proporción, el tonelaje de la serie. */
  correctedValues: z.record(z.string(), z.number().nullable()).nullable(),
  reason: z.string(),
  authorMemberId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type RecordAdjustment = z.infer<typeof recordAdjustmentSchema>;

/** Una nota del paciente para su equipo (RN-G13): no leída hasta que alguien del equipo la abre. */
export const appNoteSchema = noteLogSchema.extend({
  readAt: z.iso.datetime({ offset: true }).nullable(),
});
export type AppNote = z.infer<typeof appNoteSchema>;

/** GET /api/v1/patients/:id/app-notes?unread=true */
export const appNotesResponseSchema = z.object({ notes: z.array(appNoteSchema) });
export type AppNotesResponse = z.infer<typeof appNotesResponseSchema>;

/** POST /api/v1/patients/:id/app-notes/read: las notas que el profesional abrió (RN-G13). */
export const markAppNotesReadSchema = z.strictObject({
  noteIds: z.array(z.uuid()).min(1).max(100),
});
export type MarkAppNotesRead = z.infer<typeof markAppNotesReadSchema>;

export const setLogSchema = z.object({
  id: z.uuid(),
  workoutLogId: z.uuid(),
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  setNo: z.number().int(),
  isWarmup: z.boolean(),
  reps: z.number().nullable(),
  loadKg: z.number().nullable(),
  rir: z.number().nullable(),
  rpe: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  distanceM: z.number().nullable(),
  tonnageKg: z.number(),
  status: z.enum(RECORD_STATUSES),
});
export type SetLog = z.infer<typeof setLogSchema>;

/**
 * GET /api/v1/patients/:id/records/:date: los registros de un día como los ve el profesional (RN-G01), en solo lectura, con sus
 * ajustes (RN-G02). Los totales y el agua van con los ajustes aplicados; los originales, aparte.
 */
export const patientDaySchema = z.object({
  localDate: isoDate,
  foods: z.array(foodLogSchema),
  hydration: z.array(hydrationLogSchema),
  notes: z.array(appNoteSchema),
  metrics: z.array(metricLogSchema),
  checkin: checkinSchema.nullable(),
  workouts: z.array(workoutLogSchema.extend({ sets: z.array(setLogSchema) })),
  adjustments: z.array(recordAdjustmentSchema),
  totals: dayTotalsSchema,
  originalTotals: dayTotalsSchema,
  waterMl: z.number().int(),
  originalWaterMl: z.number().int(),
});
export type PatientDay = z.infer<typeof patientDaySchema>;
