import { z } from 'zod';
import { POPULATIONS, SEXES } from '../clinical/patient.js';
import { EVALUATION_LEVELS } from './catalog.js';

const isoDate = z.iso.date();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Una toma se guarda con 2 decimales (numeric(7,2)): más precisión se rechaza en vez de redondearse en silencio. */
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
export const measuredValueSchema = z.number().refine(twoDecimals, 'Usa hasta 2 decimales.');

export const EVALUATION_KINDS = ['ANTHROPOMETRY', 'BIA', 'MIXED'] as const;
export const EVALUATION_STATUSES = ['DRAFT', 'CLOSED', 'AMENDED'] as const;
export const MEASUREMENT_SIDES = ['RIGHT', 'LEFT'] as const;
export const CONSOLIDATIONS = ['SINGLE', 'MEAN_2', 'MEDIAN_3'] as const;

/**
 * Condiciones de la evaluación, versión 1 (RN-C09). ⚠️ Provisional. La hora es la de measuredAt. Dos evaluaciones
 * comparadas «difieren» si cambia el evaluador, el ayuno o la actividad intensa previa, o si la hora del día se aleja
 * más de 2 horas.
 */
export const evaluationConditionsSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** En ayunas al medir. */
    fasting: z.boolean(),
    /** Actividad física intensa en las 24 horas previas. */
    intenseActivityLast24h: z.boolean(),
    /** Estado de hidratación, en palabras del evaluador. */
    hydration: z.string().trim().max(200).nullable().default(null),
  })
  .strict();
export type EvaluationConditions = z.infer<typeof evaluationConditionsSchema>;

/**
 * POST /api/v1/patients/:patientId/evaluations. Exige HEALTH_DATA vigente (RN-B01) y escribe solo el equipo con
 * acceso de escritura (RN-A05). Una evaluación antropométrica o mixta lleva nivel; una de bioimpedancia, no.
 */
export const createEvaluationSchema = z
  .object({
    kind: z.enum(EVALUATION_KINDS).default('ANTHROPOMETRY'),
    level: z.enum(EVALUATION_LEVELS).nullable().default(null),
    measuredAt: z.iso.datetime(),
    conditions: evaluationConditionsSchema,
    /** Evaluador (RN-C09): por defecto, quien crea la evaluación. */
    evaluatorMemberId: z.uuid().optional(),
    notes: optionalText(2000),
  })
  .refine(({ kind, level }) => (kind === 'BIA' ? level === null : level !== null), {
    message: 'Una evaluación antropométrica o mixta lleva nivel; una de bioimpedancia, no.',
    path: ['level'],
  });
export type CreateEvaluation = z.input<typeof createEvaluationSchema>;

/** PATCH /api/v1/evaluations/:id con If-Match: solo en borrador (RN-C07). */
export const updateEvaluationSchema = z
  .object({
    level: z.enum(EVALUATION_LEVELS),
    measuredAt: z.iso.datetime(),
    conditions: evaluationConditionsSchema,
    evaluatorMemberId: z.uuid(),
    notes: optionalText(2000),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, 'Indica qué cambia.');
export type UpdateEvaluation = z.input<typeof updateEvaluationSchema>;

/**
 * PUT /api/v1/evaluations/:id/measurements/:siteCode con If-Match: reemplaza las tomas del sitio. Se pueden guardar
 * de a una (el protocolo ISAK recorre todos los sitios y luego repite la serie). La 3.ª toma solo se acepta si la
 * diferencia entre las dos primeras supera la tolerancia del sitio (RN-C02). Fuera del rango del catálogo, 422 con
 * RN-C04. DELETE en la misma ruta quita el sitio del borrador.
 */
export const recordMeasurementSchema = z.object({
  attempts: z.array(measuredValueSchema).min(1).max(3),
  side: z.enum(MEASUREMENT_SIDES).default('RIGHT'),
});
export type RecordMeasurement = z.input<typeof recordMeasurementSchema>;

/** Un sitio con sus tomas. El consolidado es derivado (RN-C03): media de dos, mediana de tres. */
export const measurementSchema = z.object({
  siteCode: z.string(),
  attempts: z.array(z.number()),
  side: z.enum(MEASUREMENT_SIDES),
  /** null mientras falte una toma o la 3.ª. */
  consolidatedValue: z.number().nullable(),
  consolidation: z.enum(CONSOLIDATIONS).nullable(),
  /** Diferencia relativa entre la 1.ª y la 2.ª toma, en %; null con una sola toma. */
  diffPct: z.number().nullable(),
  needsThird: z.boolean(),
});
export type Measurement = z.infer<typeof measurementSchema>;

/**
 * Bioimpedancia cargada a mano (RN-C08). ⚠️ N19. Lista cerrada de indicadores, cada uno con las unidades que usan los
 * equipos. Cada valor guarda el nombre que le da el equipo (deviceLabel): la masa muscular no se define igual en
 * todos. Se rotula con marca y modelo y nunca comparte serie con la antropometría.
 */
export const BIA_METRICS = [
  'FAT_PCT',
  'FAT_MASS',
  'FAT_FREE_MASS',
  'MUSCLE_MASS',
  'TOTAL_BODY_WATER',
  'VISCERAL_FAT',
  'BMR',
  'PHASE_ANGLE',
] as const;
export type BiaMetric = (typeof BIA_METRICS)[number];
export const BIA_UNITS = ['%', 'kg', 'L', 'level', 'cm2', 'kcal', 'deg'] as const;
export type BiaUnit = (typeof BIA_UNITS)[number];
export const BIA_METRIC_UNITS = {
  FAT_PCT: ['%'],
  FAT_MASS: ['kg'],
  FAT_FREE_MASS: ['kg'],
  MUSCLE_MASS: ['kg'],
  TOTAL_BODY_WATER: ['kg', 'L', '%'],
  VISCERAL_FAT: ['level', 'cm2'],
  BMR: ['kcal'],
  PHASE_ANGLE: ['deg'],
} as const satisfies Record<BiaMetric, readonly BiaUnit[]>;

export const biaValueSchema = z
  .object({
    metric: z.enum(BIA_METRICS),
    value: z.number().min(0).max(100_000),
    unit: z.enum(BIA_UNITS),
    /** El nombre del indicador tal como lo muestra el equipo. */
    deviceLabel: z.string().trim().min(1).max(80),
  })
  .refine(({ metric, unit }) => (BIA_METRIC_UNITS[metric] as readonly BiaUnit[]).includes(unit), {
    message: 'Esa unidad no corresponde al indicador.',
    path: ['unit'],
  })
  .refine(({ unit, value }) => unit !== '%' || value <= 100, {
    message: 'Un porcentaje va de 0 a 100.',
    path: ['value'],
  });
export type BiaValue = z.infer<typeof biaValueSchema>;

/** POST /api/v1/evaluations/:id/bia-readings, solo en borrador de una evaluación BIA o MIXED. */
export const createBiaReadingSchema = z.object({
  deviceBrand: z.string().trim().min(1).max(60),
  deviceModel: z.string().trim().min(1).max(60),
  readings: z
    .array(biaValueSchema)
    .min(1)
    .max(BIA_METRICS.length)
    .refine(
      (values) => new Set(values.map(({ metric }) => metric)).size === values.length,
      'Cada indicador va una sola vez.',
    ),
});
export type CreateBiaReading = z.input<typeof createBiaReadingSchema>;

export const biaReadingSchema = z.object({
  id: z.uuid(),
  deviceBrand: z.string(),
  deviceModel: z.string(),
  readings: z.array(biaValueSchema),
  enteredBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type BiaReading = z.infer<typeof biaReadingSchema>;

/**
 * POST /api/v1/evaluations/:id/amendments: una evaluación cerrada no se edita; se enmienda con una revisión nueva en
 * borrador, con motivo, que copia las tomas (RN-C07). Al cerrar la revisión, la original pasa a AMENDED y sus
 * resultados quedan como histórico.
 */
export const amendEvaluationSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
export type AmendEvaluation = z.infer<typeof amendEvaluationSchema>;

/** Sexo, edad decimal y población al medir: lo que usan las ecuaciones de esta evaluación. */
export const patientSnapshotSchema = z.object({
  sex: z.enum(SEXES),
  ageYears: z.number(),
  population: z.enum(POPULATIONS),
});
export type PatientSnapshot = z.infer<typeof patientSnapshotSchema>;

export const evaluationSummarySchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  evaluatorMemberId: z.uuid(),
  kind: z.enum(EVALUATION_KINDS),
  level: z.enum(EVALUATION_LEVELS).nullable(),
  measuredAt: z.iso.datetime(),
  localDate: isoDate,
  status: z.enum(EVALUATION_STATUSES),
  revision: z.number().int(),
  amendsEvaluationId: z.uuid().nullable(),
  /** La revisión que enmendó a esta, si la hay. */
  amendedByEvaluationId: z.uuid().nullable(),
  closedAt: z.iso.datetime().nullable(),
});
export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;

/** GET /api/v1/patients/:patientId/evaluations, de la más reciente a la más antigua. */
export const evaluationListResponseSchema = z.object({
  evaluations: z.array(evaluationSummarySchema),
});
export type EvaluationListResponse = z.infer<typeof evaluationListResponseSchema>;

/**
 * GET /api/v1/evaluations/:id (deja READ en la auditoría, RN-B03). Lo devuelven también las escrituras sobre la
 * evaluación; `version` va en el If-Match de la siguiente (06 §5: 409 si no coincide).
 */
export const evaluationResponseSchema = evaluationSummarySchema.extend({
  conditions: evaluationConditionsSchema,
  patientSnapshot: patientSnapshotSchema,
  amendReason: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  measurements: z.array(measurementSchema),
  biaReadings: z.array(biaReadingSchema),
  /** Qué falta para cerrar (02 §7): los sitios que exige el nivel, sin consolidar o con la 3.ª toma pendiente. */
  progress: z.object({
    requiredSites: z.array(z.string()),
    missingSites: z.array(z.string()),
    needsThirdSites: z.array(z.string()),
    canClose: z.boolean(),
  }),
});
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;
