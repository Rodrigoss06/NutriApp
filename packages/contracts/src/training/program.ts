import { z } from 'zod';
import { upToDecimals } from '../decimals.js';
import { MOVEMENT_PATTERNS, TRAINING_LEVELS } from '../exercise/library.js';
import { TRAINING_OBJECTIVE_CODES } from './athlete-profile.js';

/** Los códigos del programa de entrenamiento (RF-26, 02 §7): el motor y la tabla de 05.2 hablan con estos. */
export const PROGRAM_STATUSES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Armado a mano o propuesto por la plantilla (RN-F14). */
export const PROGRAM_ORIGINS = ['MANUAL', 'PROPOSAL'] as const;
export type ProgramOrigin = (typeof PROGRAM_ORIGINS)[number];

/** La fórmula de 1RM del paciente: Epley por defecto, Brzycki opcional; siempre la misma (RN-F04). */
export const ONE_RM_FORMULAS = ['ONERM_EPLEY1985', 'ONERM_BRZYCKI1993'] as const;
export type OneRmFormula = (typeof ONE_RM_FORMULAS)[number];

export const LOAD_KINDS = ['KG', 'PCT_1RM', 'RPE', 'RIR', 'BODYWEIGHT'] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];

export const SET_TYPES = ['WARMUP', 'WORKING', 'DROP', 'AMRAP', 'BACKOFF'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const ROUTINE_SPLIT_CODES = [
  'FULL_BODY',
  'FULL_BODY_ABC',
  'UPPER_LOWER',
  'PUSH_PULL_LEGS',
] as const;
export const TRAINING_INTENSITY_CODES = [
  'LOW',
  'LOW_MODERATE',
  'MODERATE',
  'MODERATE_HIGH',
  'HIGH',
  'VERY_HIGH',
] as const;
export const REVIEW_KIND_CODES = ['DAILY', 'CONTROL'] as const;

const programName = z.string().trim().min(1).max(120);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value));

/** POST /api/v1/patients/:id/training-programs: un programa a mano, vacío; se le agregan mesociclos. */
export const createProgramSchema = z.strictObject({
  name: programName,
  goal: optionalText(500),
  startDate: z.iso.date().nullable().default(null),
  oneRmFormula: z.enum(ONE_RM_FORMULAS).nullable().default(null),
});
export type CreateProgram = z.input<typeof createProgramSchema>;

/** POST /api/v1/patients/:id/training-programs/proposal: sale del perfil; bloqueada si falta una llave (RN-F15). */
export const createProposalSchema = z.strictObject({
  name: programName.nullable().default(null),
});
export type CreateProposal = z.input<typeof createProposalSchema>;

/** PATCH /api/v1/training-programs/:id con If-Match. */
export const updateProgramSchema = z
  .strictObject({
    name: programName,
    goal: z.string().trim().max(500).nullable(),
    startDate: z.iso.date().nullable(),
    oneRmFormula: z.enum(ONE_RM_FORMULAS),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, { message: 'No hay nada que cambiar.' });
export type UpdateProgram = z.input<typeof updateProgramSchema>;

/** POST /api/v1/training-programs/:id/mesocycles con If-Match: sus semanas siguen a las anteriores. */
export const addMesocycleSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  focus: optionalText(300),
  weeks: z.number().int().min(1).max(12),
});
export type AddMesocycle = z.input<typeof addMesocycleSchema>;

/** Las columnas guardan estos decimales: más precisión se rechaza en vez de redondearse en silencio (RN-D09). */
const prescribedSetSchema = z.strictObject({
  setType: z.enum(SET_TYPES).default('WORKING'),
  repsMin: z.number().int().min(1).max(600).nullable().default(null),
  repsMax: z.number().int().min(1).max(600).nullable().default(null),
  loadKind: z.enum(LOAD_KINDS).nullable().default(null),
  loadValue: z
    .number()
    .min(0)
    .max(9_999)
    .refine(upToDecimals(2), 'Usa hasta 2 decimales.')
    .nullable()
    .default(null),
  restSeconds: z.number().int().min(0).max(3_600).nullable().default(null),
  tempo: optionalText(20),
  /** Cardio: se prescribe en minutos (RN-F10); aquí, en segundos. */
  durationSeconds: z.number().int().min(1).max(86_400).nullable().default(null),
  distanceM: z
    .number()
    .positive()
    .max(999_999)
    .refine(upToDecimals(1), 'Usa hasta 1 decimal.')
    .nullable()
    .default(null),
  met: z
    .number()
    .positive()
    .max(99)
    .refine(upToDecimals(1), 'Usa hasta 1 decimal.')
    .nullable()
    .default(null),
});

const prescribedExerciseSchema = z.strictObject({
  /** El de la fila ya guardada: así conserva su aprobación si el ejercicio no cambia (RN-F14). */
  id: z.uuid().nullable().default(null),
  exerciseId: z.uuid(),
  supersetGroup: z.string().trim().max(10).nullable().default(null),
  notes: optionalText(500),
  sets: z.array(prescribedSetSchema).min(1).max(20),
});

const programSessionSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  dayOfWeek: z.number().int().min(1).max(7).nullable().default(null),
  notes: optionalText(500),
  exercises: z.array(prescribedExerciseSchema).max(30),
});

/**
 * PUT /api/v1/training-programs/:id/weeks/:weekId con If-Match: reemplaza las sesiones de la semana. Lo que no llega de la
 * semana (fase, factor, RIR) no cambia: el coach edita las semanas (P-07).
 */
export const saveProgramWeekSchema = z.strictObject({
  isDeload: z.boolean().optional(),
  phaseEs: z.string().trim().max(120).nullable().optional(),
  phaseGoalEs: z.string().trim().max(120).nullable().optional(),
  volumeFactor: z
    .number()
    .positive()
    .max(2)
    .refine(upToDecimals(2), 'Usa hasta 2 decimales.')
    .nullable()
    .optional(),
  intensity: z.enum(TRAINING_INTENSITY_CODES).nullable().optional(),
  targetRir: z.number().int().min(0).max(5).nullable().optional(),
  reviewKind: z.enum(REVIEW_KIND_CODES).nullable().optional(),
  sessions: z.array(programSessionSchema).max(14),
});
export type SaveProgramWeek = z.input<typeof saveProgramWeekSchema>;

/** POST /api/v1/training-programs/:id/weeks/:weekId/duplicate con If-Match: copia sus sesiones a otras semanas. */
export const duplicateWeekSchema = z.strictObject({
  targetWeekIds: z.array(z.uuid()).min(1).max(12),
});
export type DuplicateWeek = z.input<typeof duplicateWeekSchema>;

/**
 * POST /api/v1/training-programs/:id/blocks/approve con If-Match: aprueba un bloque de la propuesta en todas las semanas, con
 * sustitución opcional y nota (RN-F14). El bloque es el día y su orden en la plantilla.
 */
export const approveBlockSchema = z.strictObject({
  day: z.number().int().min(1).max(14),
  order: z.number().int().min(1).max(30),
  exerciseId: z.uuid().nullable().default(null),
  note: optionalText(500),
});
export type ApproveBlock = z.input<typeof approveBlockSchema>;

export const programSummarySchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  lineageId: z.uuid(),
  versionNo: z.number().int(),
  name: z.string(),
  goal: z.string().nullable(),
  status: z.enum(PROGRAM_STATUSES),
  origin: z.enum(PROGRAM_ORIGINS),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  oneRmFormula: z.enum(ONE_RM_FORMULAS),
  objective: z.enum(TRAINING_OBJECTIVE_CODES).nullable(),
  level: z.enum(TRAINING_LEVELS).nullable(),
  daysPerWeek: z.number().int().nullable(),
  split: z.enum(ROUTINE_SPLIT_CODES).nullable(),
  macrocycleWeeks: z.number().int().nullable(),
  /** La versión de la tabla de fases que usó (RN-F13). */
  periodizationValidFrom: z.iso.date().nullable(),
  /** La versión de la plantilla de bloques que usó (RN-F14). */
  templateVersion: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  version: z.number().int(),
});
export type ProgramSummary = z.infer<typeof programSummarySchema>;

export const programListResponseSchema = z.object({ programs: z.array(programSummarySchema) });
export type ProgramListResponse = z.infer<typeof programListResponseSchema>;

const muscleSchema = z.object({ code: z.string(), name: z.string() });
const exerciseRefSchema = z.object({ id: z.uuid(), name: z.string() }).nullable();

const programDocumentSetSchema = z.object({
  setNo: z.number().int(),
  setType: z.enum(SET_TYPES),
  repsMin: z.number().int().nullable(),
  repsMax: z.number().int().nullable(),
  loadKind: z.enum(LOAD_KINDS).nullable(),
  loadValue: z.number().nullable(),
  restSeconds: z.number().int().nullable(),
  tempo: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  distanceM: z.number().nullable(),
  met: z.number().nullable(),
});

const programDocumentExerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  name: z.string(),
  pattern: z.enum(MOVEMENT_PATTERNS),
  position: z.number().int(),
  supersetGroup: z.string().nullable(),
  notes: z.string().nullable(),
  /** El patrón del bloque de la propuesta; a mano, null. */
  movementPattern: z.enum(MOVEMENT_PATTERNS).nullable(),
  suggestedExerciseId: z.uuid().nullable(),
  substitutionNote: z.string().nullable(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  /** Congelados al publicar: no cambian aunque se edite la biblioteca (RN-F12). */
  primaryMuscles: z.array(muscleSchema),
  secondaryMuscles: z.array(muscleSchema),
  caution: z.string().nullable(),
  alternative: exerciseRefSchema,
  easierVariant: exerciseRefSchema,
  harderVariant: exerciseRefSchema,
  mediaUrl: z.string().nullable(),
  instructions: z.string().nullable(),
  sets: z.array(programDocumentSetSchema),
});

const programDocumentSessionSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  name: z.string(),
  dayOfWeek: z.number().int().nullable(),
  notes: z.string().nullable(),
  /** Series efectivas por grupo muscular, con conteo fraccional (RN-F06). */
  setsByMuscle: z.record(z.string(), z.number()),
  exercises: z.array(programDocumentExerciseSchema),
});

const programDocumentWeekSchema = z.object({
  id: z.uuid(),
  weekNo: z.number().int(),
  isDeload: z.boolean(),
  phaseEs: z.string().nullable(),
  phaseGoalEs: z.string().nullable(),
  volumeFactor: z.number().nullable(),
  intensity: z.enum(TRAINING_INTENSITY_CODES).nullable(),
  targetRir: z.number().int().nullable(),
  reviewKind: z.enum(REVIEW_KIND_CODES).nullable(),
  sessions: z.array(programDocumentSessionSchema),
});

export const programDocumentSchema = z.object({
  totalWeeks: z.number().int(),
  /** El método de las series por grupo muscular (RN-D01). */
  setsMethod: z.object({ code: z.string(), version: z.string() }),
  mesocycles: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int(),
      name: z.string(),
      focus: z.string().nullable(),
      weeks: z.array(programDocumentWeekSchema),
    }),
  ),
});
export type ProgramDocument = z.infer<typeof programDocumentSchema>;

/**
 * Un programa: en borrador, armado con la biblioteca de hoy y con lo que falta para publicar; publicado, lo que se congeló
 * (RN-F12).
 */
export const programDetailSchema = programSummarySchema.extend({
  document: programDocumentSchema,
  publishProblems: z.array(z.string()),
});
export type ProgramDetail = z.infer<typeof programDetailSchema>;
