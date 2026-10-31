import { z } from 'zod';

/** Los 15 patrones de movimiento (07 §5), con el mismo código en el motor y en exercise.movement_pattern. */
export const MOVEMENT_PATTERNS = [
  'SQUAT',
  'HINGE',
  'HIP_EXTENSION',
  'UNILATERAL',
  'HORIZONTAL_PUSH',
  'VERTICAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PULL',
  'SHOULDER',
  'BICEPS',
  'TRICEPS',
  'CORE_ANTI_EXTENSION',
  'CORE_ANTI_ROTATION',
  'CALF',
  'CONDITIONING',
] as const;
export type MovementPatternCode = (typeof MOVEMENT_PATTERNS)[number];

export const TRAINING_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type TrainingLevelCode = (typeof TRAINING_LEVELS)[number];

export const EXERCISE_MODALITIES = ['STRENGTH', 'CARDIO', 'MOBILITY', 'PLYOMETRIC'] as const;
export type ExerciseModality = (typeof EXERCISE_MODALITIES)[number];

/** Qué cuentan los valores base: repeticiones, segundos (una plancha) o minutos (una caminata). */
export const EXERCISE_BASE_MEASURES = ['REPS', 'SECONDS', 'MINUTES'] as const;
export type ExerciseBaseMeasure = (typeof EXERCISE_BASE_MEASURES)[number];

/** Un ejercicio no se borra: se archiva y deja de ofrecerse al prescribir. */
export const EXERCISE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];

/** Solo para el perfil de entrenamiento (07 §2): ningún ejercicio lo lleva. */
export const FULL_GYM_EQUIPMENT = 'FULL_GYM';

/** GET /api/v1/exercises/catalog: patrones, grupos musculares y equipos, en su orden. */
export const exerciseCatalogResponseSchema = z.object({
  patterns: z.array(z.object({ code: z.enum(MOVEMENT_PATTERNS), name: z.string() })),
  muscles: z.array(z.object({ code: z.string(), name: z.string(), region: z.string() })),
  equipment: z.array(z.object({ code: z.string(), name: z.string() })),
});
export type ExerciseCatalogResponse = z.infer<typeof exerciseCatalogResponseSchema>;

/**
 * GET /api/v1/exercises?q=sentadilla&pattern=SQUAT&level=BEGINNER&equipment=DUMBBELL&muscle=GLUTES&limit=50: sin tildes
 * ni mayúsculas, también por sus alias. Sin q, por patrón y nombre. Los archivados solo se ven si se piden.
 */
export const exerciseSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  pattern: z.enum(MOVEMENT_PATTERNS).optional(),
  level: z.enum(TRAINING_LEVELS).optional(),
  equipment: z.string().trim().max(40).optional(),
  muscle: z.string().trim().max(40).optional(),
  status: z.enum(EXERCISE_STATUSES).default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ExerciseSearchQuery = z.infer<typeof exerciseSearchQuerySchema>;

export const exerciseSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  aliases: z.array(z.string()),
  pattern: z.enum(MOVEMENT_PATTERNS),
  level: z.enum(TRAINING_LEVELS),
  modality: z.enum(EXERCISE_MODALITIES),
  equipmentName: z.string().nullable(),
  /** Los nombres de sus músculos principales. */
  primaryMuscles: z.array(z.string()),
  /** Propio de la organización: se edita; los de referencia no (RN-I01). */
  own: z.boolean(),
  /** Redactado por el equipo: Jeremy aún no lo revisa (ADR-071). */
  provisional: z.boolean(),
  status: z.enum(EXERCISE_STATUSES),
});
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;

export const exerciseListResponseSchema = z.object({ exercises: z.array(exerciseSummarySchema) });
export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>;

const exerciseRefSchema = z.object({ id: z.uuid(), name: z.string() });
export type ExerciseRef = z.infer<typeof exerciseRefSchema>;

const muscleRefSchema = z.object({ code: z.string(), name: z.string() });

/** Un ejercicio con su ficha completa (RF-25). Los valores base los usa el editor de programas al agregarlo. */
export const exerciseDetailSchema = exerciseSummarySchema.omit({ primaryMuscles: true }).extend({
  code: z.string().nullable(),
  equipmentCode: z.string().nullable(),
  isUnilateral: z.boolean(),
  primaryMuscles: z.array(muscleRefSchema),
  secondaryMuscles: z.array(muscleRefSchema),
  caution: z.string().nullable(),
  /** Sustitución (07 §5). */
  alternative: exerciseRefSchema.nullable(),
  /** Regresión y progresión (RN-F11, P-13). */
  easierVariant: exerciseRefSchema.nullable(),
  harderVariant: exerciseRefSchema.nullable(),
  baseSets: z.number().int().nullable(),
  baseRepsMin: z.number().int().nullable(),
  baseRepsMax: z.number().int().nullable(),
  baseMeasure: z.enum(EXERCISE_BASE_MEASURES),
  baseRestSeconds: z.number().int().nullable(),
  mediaUrl: z.string().nullable(),
  instructions: z.string().nullable(),
  version: z.number().int(),
});
export type ExerciseDetail = z.infer<typeof exerciseDetailSchema>;

/** Texto opcional: en blanco es lo mismo que no tenerlo. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value));

/**
 * POST /api/v1/exercises y PUT /api/v1/exercises/:id (If-Match): un ejercicio propio de la organización (RN-I01).
 * El video o la imagen van por enlace (RF-25): solo https. Editar reemplaza sus músculos.
 */
export const ownExerciseRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  pattern: z.enum(MOVEMENT_PATTERNS),
  level: z.enum(TRAINING_LEVELS),
  modality: z.enum(EXERCISE_MODALITIES),
  equipmentCode: z.string().trim().min(1).max(40).nullable().default(null),
  isUnilateral: z.boolean().default(false),
  primaryMuscles: z.array(z.string().trim().min(1).max(40)).min(1).max(5),
  secondaryMuscles: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  caution: optionalText(300),
  alternativeId: z.uuid().nullable().default(null),
  easierVariantId: z.uuid().nullable().default(null),
  harderVariantId: z.uuid().nullable().default(null),
  baseSets: z.number().int().min(1).max(10).nullable().default(null),
  baseRepsMin: z.number().int().min(1).max(600).nullable().default(null),
  baseRepsMax: z.number().int().min(1).max(600).nullable().default(null),
  baseMeasure: z.enum(EXERCISE_BASE_MEASURES).default('REPS'),
  baseRestSeconds: z.number().int().min(0).max(600).nullable().default(null),
  mediaUrl: z
    .url({ protocol: /^https$/ })
    .max(500)
    .nullable()
    .default(null),
  instructions: optionalText(2_000),
});
export type OwnExerciseRequest = z.input<typeof ownExerciseRequestSchema>;

/**
 * Una fila de la tabla patrón × nivel (07 §5): la que puso la organización o, si no puso, la de la V3. La usa la
 * propuesta de rutina (RN-F14).
 */
export const patternChoiceSchema = z.object({
  pattern: z.enum(MOVEMENT_PATTERNS),
  level: z.enum(TRAINING_LEVELS),
  exercise: exerciseRefSchema,
  /** La puso la organización: se puede volver a la de la V3. */
  own: z.boolean(),
  provisional: z.boolean(),
});
export type PatternChoice = z.infer<typeof patternChoiceSchema>;

export const patternChoiceListResponseSchema = z.object({ choices: z.array(patternChoiceSchema) });
export type PatternChoiceListResponse = z.infer<typeof patternChoiceListResponseSchema>;

/** PUT /api/v1/exercise-pattern-choices/:pattern/:level: el ejercicio de esa fila para la organización. */
export const patternChoiceRequestSchema = z.strictObject({ exerciseId: z.uuid() });
export type PatternChoiceRequest = z.infer<typeof patternChoiceRequestSchema>;

/** Los parámetros de la ruta de una fila de la tabla. */
export const patternChoiceParamsSchema = z.object({
  pattern: z.enum(MOVEMENT_PATTERNS),
  level: z.enum(TRAINING_LEVELS),
});
