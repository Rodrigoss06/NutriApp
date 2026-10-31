import { z } from 'zod';
import { emailSchema } from '../iam/access.js';
import { ANAMNESIS_FORM, anamnesisAnswersV2Schema, performanceProfileSchema } from './anamnesis.js';

const isoDate = z.iso.date();
const block = z.string().trim().max(2000).optional();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/**
 * Historia clínica v1 (RF-09): texto libre por bloque. Desde la anamnesis V2 (RF-43) queda de solo lectura. Los bloques
 * no se interpretan. Condiciones, alergias, medicamentos, cirugías y lesiones también se registran como filas consultables
 * en clinical.condition; nunca se extraen de este texto.
 */
export const LEGACY_HISTORY_FORM = { code: 'ANAMNESIS', version: '1' } as const;
export const clinicalHistoryAnswersV1Schema = z
  .object({
    personalHistory: block,
    familyHistory: block,
    dietHabits: block,
    physicalActivity: block,
    sleep: block,
    tobacco: block,
    alcohol: block,
    medications: block,
    supplements: block,
    allergies: block,
    intolerances: block,
    surgeries: block,
    injuries: block,
    goals: block,
  })
  .strict();
export type ClinicalHistoryAnswersV1 = z.infer<typeof clinicalHistoryAnswersV1Schema>;

/**
 * Cada guardado es una revisión nueva de la anamnesis V2: se envía la revisión sobre la que se editó (bloqueo optimista).
 */
export const saveClinicalHistorySchema = z.object({
  expectedRevision: z.number().int().min(0),
  answers: anamnesisAnswersV2Schema,
});
export type SaveClinicalHistory = z.infer<typeof saveClinicalHistorySchema>;

const revisionMeta = {
  revision: z.number().int(),
  recordedAt: z.iso.datetime(),
  recordedBy: z.uuid(),
};

/** Una revisión con sus respuestas: las de la v1 no tienen perfil de rendimiento. */
export const clinicalHistoryRevisionSchema = z.discriminatedUnion('formCode', [
  z.object({
    ...revisionMeta,
    formCode: z.literal(ANAMNESIS_FORM.code),
    formVersion: z.literal(ANAMNESIS_FORM.version),
    answers: anamnesisAnswersV2Schema,
    profile: performanceProfileSchema.nullable(),
  }),
  z.object({
    ...revisionMeta,
    formCode: z.literal(LEGACY_HISTORY_FORM.code),
    formVersion: z.literal(LEGACY_HISTORY_FORM.version),
    answers: clinicalHistoryAnswersV1Schema,
    profile: z.null(),
  }),
]);
export type ClinicalHistoryRevision = z.infer<typeof clinicalHistoryRevisionSchema>;

/** El número de una revisión en la ruta: lo que no cabe en la columna tampoco es una revisión. */
export const historyRevisionNumberSchema = z.coerce.number().int().min(1).max(2_147_483_647);

export const clinicalHistoryResponseSchema = z.object({
  current: clinicalHistoryRevisionSchema.nullable(),
  revisions: z.array(
    z.object({
      ...revisionMeta,
      formCode: z.enum([ANAMNESIS_FORM.code, LEGACY_HISTORY_FORM.code]),
    }),
  ),
});
export type ClinicalHistoryResponse = z.infer<typeof clinicalHistoryResponseSchema>;

export const CONDITION_KINDS = [
  'DISEASE',
  'ALLERGY',
  'INTOLERANCE',
  'MEDICATION',
  'SUPPLEMENT',
  'SURGERY',
  'INJURY',
  'OTHER',
] as const;
export const CONDITION_STATUSES = ['ACTIVE', 'RESOLVED'] as const;

export const createConditionSchema = z.object({
  kind: z.enum(CONDITION_KINDS),
  label: z.string().trim().min(1).max(200),
  codeSystem: optionalText(20),
  code: optionalText(20),
  since: isoDate.nullable().optional(),
  notes: optionalText(2000),
});
export type CreateCondition = z.input<typeof createConditionSchema>;

/** De una condición solo cambian el estado y las notas: lo registrado no se reescribe. */
export const updateConditionSchema = z
  .object({ status: z.enum(CONDITION_STATUSES), notes: optionalText(2000) })
  .partial()
  .refine((change) => Object.keys(change).length > 0, 'Indica qué cambia.');
export type UpdateCondition = z.input<typeof updateConditionSchema>;

export const conditionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CONDITION_KINDS),
  label: z.string(),
  codeSystem: z.string().nullable(),
  code: z.string().nullable(),
  status: z.enum(CONDITION_STATUSES),
  since: isoDate.nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Condition = z.infer<typeof conditionSchema>;
export const conditionListResponseSchema = z.object({ conditions: z.array(conditionSchema) });
export type ConditionListResponse = z.infer<typeof conditionListResponseSchema>;

export const GOAL_KINDS = [
  'FAT_LOSS',
  'MUSCLE_GAIN',
  'MAINTENANCE',
  'RECOMPOSITION',
  'PERFORMANCE',
  'HEALTH',
  'OTHER',
] as const;
export const GOAL_STATUSES = ['ACTIVE', 'ACHIEVED', 'ABANDONED'] as const;

export const createGoalSchema = z.object({
  kind: z.enum(GOAL_KINDS),
  /** Indicador de la meta, si tiene: lo eligen los profesionales; el catálogo llega con la evaluación (P7). */
  metricCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/)
    .nullable()
    .optional(),
  targetValue: z.number().nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  notes: optionalText(2000),
});
export type CreateGoal = z.input<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({ status: z.enum(GOAL_STATUSES), notes: optionalText(2000) })
  .partial()
  .refine((change) => Object.keys(change).length > 0, 'Indica qué cambia.');
export type UpdateGoal = z.input<typeof updateGoalSchema>;

export const goalSchema = z.object({
  id: z.uuid(),
  kind: z.enum(GOAL_KINDS),
  metricCode: z.string().nullable(),
  targetValue: z.number().nullable(),
  targetDate: isoDate.nullable(),
  status: z.enum(GOAL_STATUSES),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Goal = z.infer<typeof goalSchema>;
export const goalListResponseSchema = z.object({ goals: z.array(goalSchema) });
export type GoalListResponse = z.infer<typeof goalListResponseSchema>;

export const NOTE_VISIBILITIES = ['CARE_TEAM', 'AUTHOR_ONLY'] as const;

/** Una nota no se edita: se enmienda con otra que la cita. */
export const createClinicalNoteSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  visibility: z.enum(NOTE_VISIBILITIES).default('CARE_TEAM'),
  amendsNoteId: z.uuid().nullable().optional(),
});
export type CreateClinicalNote = z.input<typeof createClinicalNoteSchema>;

export const clinicalNoteSchema = z.object({
  id: z.uuid(),
  authorMemberId: z.uuid(),
  body: z.string(),
  visibility: z.enum(NOTE_VISIBILITIES),
  amendsNoteId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type ClinicalNote = z.infer<typeof clinicalNoteSchema>;
export const clinicalNoteListResponseSchema = z.object({ notes: z.array(clinicalNoteSchema) });
export type ClinicalNoteListResponse = z.infer<typeof clinicalNoteListResponseSchema>;

/** Línea de tiempo del expediente (RF-10). Crece con evaluaciones, planes, rutinas y citas en los siguientes prompts. */
export const TIMELINE_KINDS = [
  'PATIENT_REGISTERED',
  'CONSENT_GRANTED',
  'CONSENT_REVOKED',
  'HISTORY_REVISED',
  'CONDITION_RECORDED',
  'GOAL_RECORDED',
  'NOTE_WRITTEN',
  /** Evaluación cerrada (P7): label es el nivel o BIA; detail, el motivo si es una enmienda. */
  'EVALUATION_CLOSED',
  /** Prescripción energética (P7): label es el objetivo. */
  'ENERGY_PRESCRIBED',
  /** Plan nutricional publicado (P9): label es su número de versión. */
  'NUTRITION_PLAN_PUBLISHED',
] as const;
export const timelineItemSchema = z.object({
  kind: z.enum(TIMELINE_KINDS),
  occurredAt: z.iso.datetime(),
  refId: z.uuid(),
  /** El código que identifica el hecho: la finalidad, el tipo de condición o de meta, la revisión, la visibilidad. */
  label: z.string(),
  /** Texto propio del hecho, si lo tiene: el nombre de la condición. */
  detail: z.string().nullable(),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export const timelineResponseSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
});
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;
export const timelineQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Invitar al paciente a la app (RN-A06): por defecto, al correo de su ficha. */
export const invitePatientSchema = z.object({ email: emailSchema.optional() });
export type InvitePatient = z.infer<typeof invitePatientSchema>;
