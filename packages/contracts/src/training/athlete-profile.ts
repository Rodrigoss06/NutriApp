import { z } from 'zod';
import { upToDecimals } from '../decimals.js';
import { TRAINING_LEVELS } from '../exercise/library.js';

export const TRAINING_OBJECTIVE_CODES = ['FAT_LOSS', 'HYPERTROPHY', 'STRENGTH', 'HEALTH'] as const;
export const MEDICAL_CLEARANCE_CODES = ['PENDING', 'CLEARED', 'NOT_REQUIRED'] as const;
export const PRESCRIPTION_STATUS_CODES = [
  'BLOCKED_CLEARANCE',
  'BLOCKED_PAIN',
  'BLOCKED_SCREENING',
  'BLOCKED_REFERRED',
  'PENDING_APPROVAL',
  'APPROVED',
] as const;

const optionalText = z
  .string()
  .trim()
  .max(2_000)
  .nullable()
  .default(null)
  .transform((value) => (value === '' ? null : value));

/**
 * El perfil de entrenamiento de un paciente (07 §2), lo que controla la propuesta y el macrociclo. Cada cambio es una
 * revisión nueva sobre la que se editó. La anticoncepción hormonal llega con el seguimiento menstrual (P13).
 */
const athleteProfileFields = {
  objective: z.enum(TRAINING_OBJECTIVE_CODES),
  level: z.enum(TRAINING_LEVELS),
  daysPerWeek: z.number().int().min(2).max(5),
  minutesPerSession: z.number().int().min(30).max(120).nullable().default(null),
  equipmentCodes: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  startDate: z.iso.date().nullable().default(null),
  macrocycleWeeks: z.number().int().min(8).max(12).default(12),
  medicalClearance: z.enum(MEDICAL_CLEARANCE_CODES).default('PENDING'),
  alarmSymptoms: z.boolean().default(false),
  injuriesNote: optionalText,
  restrictionsNote: optionalText,
  baselineWeightKg: z
    .number()
    .min(20)
    .max(300)
    .refine(upToDecimals(2), 'Usa hasta 2 decimales.')
    .nullable()
    .default(null),
  baselineRestingHrBpm: z.number().int().min(25).max(220).nullable().default(null),
  baselineHrvMs: z
    .number()
    .positive()
    .max(9_999)
    .refine(upToDecimals(1), 'Usa hasta 1 decimal.')
    .nullable()
    .default(null),
  sleepTargetHours: z
    .number()
    .min(4)
    .max(12)
    .refine(upToDecimals(1), 'Usa hasta 1 decimal.')
    .default(8),
  /** El objetivo de cada prueba física, por su código (07 §4). */
  testTargets: z.record(z.string().max(40), z.number().min(0).max(999_999)).default({}),
  notes: optionalText,
};

/** PUT /api/v1/patients/:id/athlete-profile. */
export const saveAthleteProfileSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  ...athleteProfileFields,
});
export type SaveAthleteProfile = z.input<typeof saveAthleteProfileSchema>;

export const athleteProfileSchema = z.object({
  revision: z.number().int(),
  objective: z.enum(TRAINING_OBJECTIVE_CODES),
  level: z.enum(TRAINING_LEVELS),
  daysPerWeek: z.number().int(),
  minutesPerSession: z.number().int().nullable(),
  equipmentCodes: z.array(z.string()),
  startDate: z.iso.date().nullable(),
  macrocycleWeeks: z.number().int(),
  medicalClearance: z.enum(MEDICAL_CLEARANCE_CODES),
  alarmSymptoms: z.boolean(),
  injuriesNote: z.string().nullable(),
  restrictionsNote: z.string().nullable(),
  baselineWeightKg: z.number().nullable(),
  baselineRestingHrBpm: z.number().int().nullable(),
  baselineHrvMs: z.number().nullable(),
  sleepTargetHours: z.number(),
  testTargets: z.record(z.string(), z.number()),
  notes: z.string().nullable(),
  recordedBy: z.uuid(),
  recordedAt: z.iso.datetime(),
});
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;

export const athleteProfileResponseSchema = z.object({ current: athleteProfileSchema.nullable() });
export type AthleteProfileResponse = z.infer<typeof athleteProfileResponseSchema>;

/**
 * GET /api/v1/patients/:id/training-safety: las tres llaves (RN-F15). Sin perfil, el alta médica cuenta como pendiente.
 * Sin evaluación postural no se bloquea: se avisa (ADR-070).
 */
export const trainingSafetyResponseSchema = z.object({
  status: z.enum(PRESCRIPTION_STATUS_CODES),
  blocked: z.boolean(),
  medicalClearance: z.enum(MEDICAL_CLEARANCE_CODES).nullable(),
  alarmSymptoms: z.boolean(),
  movement: z.object({
    /** Hay una evaluación postural cerrada. */
    evaluated: z.boolean(),
    /** Pruebas con dolor, también en un borrador: el dolor no espera al cierre. */
    painTests: z.number().int(),
  }),
  screening: z
    .object({
      id: z.uuid(),
      status: z.enum(['GREEN', 'AMBER', 'RED']),
      reviewDecision: z.enum(['START', 'LIMIT', 'REFER']).nullable(),
      answeredAt: z.iso.datetime(),
    })
    .nullable(),
});
export type TrainingSafetyResponse = z.infer<typeof trainingSafetyResponseSchema>;
