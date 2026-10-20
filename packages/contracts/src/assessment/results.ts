import { z } from 'zod';
import { POPULATIONS } from '../clinical/patient.js';
import { engineIssueSchema } from '../methods/issue.js';
import { SITE_UNITS } from './catalog.js';
import { evaluationConditionsSchema } from './evaluation.js';

/**
 * Indicadores de assessment.result_metric: un indicador por fila, en formato largo (05 §1). Cada uno se muestra con su
 * método (RN-D02) y las series nunca mezclan métodos (RN-D03).
 */
export const METRIC_CODES = [
  'BMI',
  'WAIST_HEIGHT_RATIO',
  'WAIST_HIP_RATIO',
  'SKINFOLD_SUM_MM',
  'BODY_DENSITY',
  'FAT_PCT',
  'FAT_MASS_KG',
  'FAT_FREE_MASS_KG',
  'BONE_MASS_KG',
  'RESIDUAL_MASS_KG',
  'MUSCLE_MASS_KG',
  'SKELETAL_MUSCLE_MASS_KG',
  'CORRECTED_ARM_GIRTH_CM',
  'CORRECTED_THIGH_GIRTH_CM',
  'CORRECTED_CALF_GIRTH_CM',
  'BODY_SURFACE_AREA_M2',
  'SKIN_MASS_KG',
  'ADIPOSE_MASS_KG',
  'HEAD_BONE_MASS_KG',
  'BODY_BONE_MASS_KG',
  'STRUCTURED_MASS_KG',
  'STRUCTURED_MASS_DIFF_PCT',
  'CORMIC_INDEX',
  'MANOUVRIER_INDEX',
  'ACROMIOILIAC_INDEX',
] as const;
export type MetricCode = (typeof METRIC_CODES)[number];

export const METRIC_UNITS = [
  'kg',
  '%',
  'mm',
  'cm',
  'g/mL',
  'kg/m2',
  'm2',
  'ratio',
  'index',
] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

/** Nombre de cada indicador en la interfaz y en las fichas; el método va siempre al lado (RN-D02). */
export const METRIC_LABELS = {
  BMI: 'IMC',
  WAIST_HEIGHT_RATIO: 'Índice cintura/talla',
  WAIST_HIP_RATIO: 'Índice cintura/cadera',
  SKINFOLD_SUM_MM: 'Suma de pliegues',
  BODY_DENSITY: 'Densidad corporal',
  FAT_PCT: '% de grasa',
  FAT_MASS_KG: 'Masa grasa',
  FAT_FREE_MASS_KG: 'Masa libre de grasa',
  BONE_MASS_KG: 'Masa ósea',
  RESIDUAL_MASS_KG: 'Masa residual',
  MUSCLE_MASS_KG: 'Masa muscular',
  SKELETAL_MUSCLE_MASS_KG: 'Masa muscular esquelética',
  CORRECTED_ARM_GIRTH_CM: 'Perímetro de brazo corregido',
  CORRECTED_THIGH_GIRTH_CM: 'Perímetro de muslo corregido',
  CORRECTED_CALF_GIRTH_CM: 'Perímetro de pantorrilla corregido',
  BODY_SURFACE_AREA_M2: 'Superficie corporal',
  SKIN_MASS_KG: 'Masa de la piel',
  ADIPOSE_MASS_KG: 'Masa adiposa',
  HEAD_BONE_MASS_KG: 'Masa ósea de la cabeza',
  BODY_BONE_MASS_KG: 'Masa ósea del cuerpo',
  STRUCTURED_MASS_KG: 'Masa estructurada',
  STRUCTURED_MASS_DIFF_PCT: 'Diferencia de la masa estructurada con el peso',
  CORMIC_INDEX: 'Índice córmico',
  MANOUVRIER_INDEX: 'Índice de Manouvrier',
  ACROMIOILIAC_INDEX: 'Índice acromio-ilíaco',
} as const satisfies Record<MetricCode, string>;

/** Tono de la interpretación para la interfaz: color, ícono y texto, nunca solo color. */
export const INTERPRETATION_TONES = ['NEUTRAL', 'CAUTION', 'RISK'] as const;

/** Interpretación con su fuente (RN-D10): sale de assessment.reference_range, nunca del código. */
export const interpretationSchema = z.object({
  label: z.string(),
  tone: z.enum(INTERPRETATION_TONES),
  /** «OMS 2008», «ACE»… */
  source: z.string(),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

/**
 * La tabla completa que interpreta un valor (RN-D10): sus bandas de menor a mayor, con huecos si la tabla los tiene
 * (ACE, ADR-044). Sale de assessment.reference_range; la interfaz solo la dibuja para mostrar dónde cae el valor.
 */
export const referenceScaleSchema = z.object({
  source: z.string(),
  bands: z
    .array(
      z.object({
        /** null: sin límite inferior. Intervalo semiabierto [mínimo, máximo). */
        minValue: z.number().nullable(),
        /** null: sin límite superior. */
        maxValue: z.number().nullable(),
        label: z.string(),
        tone: z.enum(INTERPRETATION_TONES),
      }),
    )
    .min(1),
});
export type ReferenceScale = z.infer<typeof referenceScaleSchema>;

export const resultMetricSchema = z.object({
  metricCode: z.enum(METRIC_CODES),
  value: z.number(),
  unit: z.enum(METRIC_UNITS),
  /**
   * Método de este número. En 4 componentes cada masa lleva el suyo: «Masa ósea 12.02 kg (Rocha 1975)»; la masa grasa
   * es la del método de dos componentes que entró como insumo.
   */
  methodCode: z.string(),
  zScore: z.number().nullable(),
  /** Con los rangos que regían en la fecha de la evaluación (RN-D10): una versión nueva no cambia lo ya medido. */
  interpretation: interpretationSchema.nullable(),
  /**
   * Por qué no hay interpretación cuando el indicador tiene rangos: en menores, «Sin interpretación pediátrica en la
   * versión 1.0» (RN-D05). El valor se muestra igual, con su método.
   */
  interpretationNote: z.string().nullable(),
  /** La escala donde cae el valor; null sin rangos para el indicador o el paciente (RN-D05). */
  referenceScale: referenceScaleSchema.nullable(),
});
export type ResultMetric = z.infer<typeof resultMetricSchema>;

export const METHOD_PURPOSES = ['FAT_PCT', 'MUSCLE', 'BONE', 'RMR', 'ONE_RM'] as const;
export type MethodPurpose = (typeof METHOD_PURPOSES)[number];

/** Resultado inmutable (RN-D01, RN-D08): recalcular crea otro y deja este como SUPERSEDED. */
export const CALCULATION_RESULT_STATUSES = ['CURRENT', 'SUPERSEDED'] as const;
export const calculationResultSchema = z.object({
  id: z.uuid(),
  methodCode: z.string(),
  methodVersion: z.string(),
  engineVersion: z.string(),
  /** SHA-256 del JSON canónico de los insumos, en hexadecimal. */
  inputsHash: z.string(),
  status: z.enum(CALCULATION_RESULT_STATUSES),
  supersededBy: z.uuid().nullable(),
  measuredAt: z.iso.datetime(),
  computedAt: z.iso.datetime(),
  warnings: z.array(engineIssueSchema),
  metrics: z.array(resultMetricSchema),
  /** Para qué es el método principal según la preferencia vigente (RN-D05): el que se usa aguas abajo. */
  principalFor: z.array(z.enum(METHOD_PURPOSES)),
});
export type CalculationResultResponse = z.infer<typeof calculationResultSchema>;

/**
 * Por qué un método no se calculó: sitios sin medir (RN-D04), nivel (RN-C01), población (RN-D05), validez (RN-D06) o
 * dependencia: 4 componentes usa la masa grasa del método principal de % de grasa, que no se calculó.
 */
export const UNAVAILABLE_REASONS = [
  'MISSING_SITES',
  'LEVEL',
  'POPULATION',
  'VALIDITY',
  'DEPENDENCY',
] as const;
export const unavailableMethodSchema = z.object({
  methodCode: z.string(),
  reason: z.enum(UNAVAILABLE_REASONS),
  missingSites: z.array(z.string()),
  issues: z.array(engineIssueSchema),
});
export type UnavailableMethod = z.infer<typeof unavailableMethodSchema>;

/**
 * GET /api/v1/evaluations/:id/results (READ en auditoría). PENDING mientras el worker no calcula la evaluación
 * cerrada; el IMC siempre se calcula, porque todo nivel mide peso y talla.
 */
export const evaluationResultsResponseSchema = z.object({
  evaluationId: z.uuid(),
  status: z.enum(['PENDING', 'READY']),
  results: z.array(calculationResultSchema),
  unavailable: z.array(unavailableMethodSchema),
  /** Aviso de la población cuando no tiene ecuación de pliegues por defecto (RN-D05). */
  populationNote: z.string().nullable(),
  /**
   * Medidas con su propio punto de corte, como la cintura (OMS 2008): el consolidado de la evaluación con su
   * interpretación, o en menores con el aviso de RN-D05; su método es la consolidación de tomas (CONSOLIDATE_ISAK).
   */
  siteInterpretations: z.array(
    z.object({
      siteCode: z.string(),
      value: z.number(),
      unit: z.enum(SITE_UNITS),
      methodCode: z.literal('CONSOLIDATE_ISAK'),
      interpretation: interpretationSchema.nullable(),
      interpretationNote: z.string().nullable(),
      referenceScale: referenceScaleSchema.nullable(),
    }),
  ),
});
export type EvaluationResultsResponse = z.infer<typeof evaluationResultsResponseSchema>;

/** Coeficientes de grupo de referencia de Lee (RN-D11): blanco o hispano, asiático, afroamericano. */
export const LEE_REFERENCE_GROUP_COEFFICIENTS = [0, -2, 1.1] as const;
export const leeReferenceGroupCoefficientSchema = z.union([
  z.literal(0),
  z.literal(-2),
  z.literal(1.1),
]);

/**
 * POST /api/v1/evaluations/:id/recalculate: acción explícita (RN-D08). Con otros insumos o versiones crea resultados
 * nuevos y deja los anteriores como SUPERSEDED; con los mismos, no cambia nada. El coeficiente de Lee de esta
 * evaluación reemplaza al de la organización y queda en los insumos (RN-D11).
 */
export const recalculateEvaluationSchema = z.object({
  leeReferenceGroupCoefficient: leeReferenceGroupCoefficientSchema.optional(),
});
export type RecalculateEvaluation = z.infer<typeof recalculateEvaluationSchema>;
export const recalculateResponseSchema = evaluationResultsResponseSchema.extend({
  created: z.number().int(),
  superseded: z.number().int(),
});
export type RecalculateResponse = z.infer<typeof recalculateResponseSchema>;

/**
 * GET /api/v1/evaluations/:id/target-weight?targetFatPct=15 (RN-E06, G-12): peso objetivo con la masa libre de grasa
 * del método principal de % de grasa. Se calcula en la API y no se guarda; la prescripción energética lo guarda.
 */
export const targetWeightResponseSchema = z.object({
  methodCode: z.literal('TARGET_WEIGHT_FAT_PCT'),
  methodVersion: z.string(),
  engineVersion: z.string(),
  weightKg: z.number(),
  fatFreeMassKg: z.number(),
  fatFreeMassMethodCode: z.string(),
  targetFatPct: z.number(),
  targetWeightKg: z.number(),
  /** Objetivo − peso actual: negativo es perder. */
  weightChangeKg: z.number(),
  warnings: z.array(engineIssueSchema),
});
export type TargetWeightResponse = z.infer<typeof targetWeightResponseSchema>;

/** Cambio frente al CMD95 del evaluador (RN-C06). UNKNOWN: el evaluador no tiene ETM para ese sitio. */
export const SIGNIFICANCES = ['CHANGE', 'NO_SIGNIFICANT_CHANGE', 'UNKNOWN'] as const;
export const CONDITION_DIFFERENCES = [
  'EVALUATOR',
  'FASTING',
  'INTENSE_ACTIVITY',
  'TIME_OF_DAY',
] as const;

const comparedEvaluationSchema = z.object({
  id: z.uuid(),
  measuredAt: z.iso.datetime(),
  evaluatorMemberId: z.uuid(),
  conditions: evaluationConditionsSchema,
});

/**
 * GET /api/v1/evaluations/:id/comparison?with=:otherId (por defecto, la evaluación cerrada anterior del paciente con
 * antropometría: una solo de bioimpedancia no comparte serie, RN-C08). Deltas = actual − anterior. El CMD95 es el del evaluador de la evaluación actual; sobre la suma de 6 pliegues usa
 * su %ETM agrupado (95 mm de Luis: 6.18 mm, G-04). No se traslada a % de grasa. Solo se comparan resultados del
 * mismo método (RN-D03) y se advierte si difieren las condiciones o el evaluador (RN-C09).
 */
export const evaluationComparisonResponseSchema = z.object({
  current: comparedEvaluationSchema,
  previous: comparedEvaluationSchema.nullable(),
  conditionDifferences: z.array(z.enum(CONDITION_DIFFERENCES)),
  sites: z.array(
    z.object({
      siteCode: z.string(),
      unit: z.enum(SITE_UNITS),
      previous: z.number(),
      current: z.number(),
      delta: z.number(),
      mdc95: z.number().nullable(),
      significance: z.enum(SIGNIFICANCES),
    }),
  ),
  /** Tríceps, subescapular, supraespinal, abdominal, muslo anterior y pantorrilla medial. */
  skinfoldSum6: z
    .object({
      previous: z.number(),
      current: z.number(),
      delta: z.number(),
      /** %ETM agrupado de los seis pliegues; null si alguno no tiene estudio de ETM. */
      temRelPct: z.number().nullable(),
      mdc95: z.number().nullable(),
      significance: z.enum(SIGNIFICANCES),
    })
    .nullable(),
  metrics: z.array(
    z.object({
      methodCode: z.string(),
      metricCode: z.enum(METRIC_CODES),
      unit: z.enum(METRIC_UNITS),
      previous: z.number(),
      current: z.number(),
      delta: z.number(),
    }),
  ),
});
export type EvaluationComparisonResponse = z.infer<typeof evaluationComparisonResponseSchema>;

/** Métodos que se pueden elegir para cada propósito (assessment.method_preference, RN-D05, RF-16). */
export const METHODS_BY_PURPOSE = {
  FAT_PCT: ['FAT_DW1974_SIRI1961', 'FAT_JP1978_7', 'FAT_FAULKNER1968', 'FAT_YUHASZ1974'],
  MUSCLE: ['MUSCLE_LEE2000', 'COMP4_DEROSE_GUIMARAES', 'COMP5_KERR1988'],
  BONE: ['BONE_ROCHA1975', 'COMP5_KERR1988'],
  RMR: [
    'RMR_MIFFLIN1990',
    'RMR_HB1919',
    'BMR_SCHOFIELD1985',
    'RMR_CUNNINGHAM1980',
    'RMR_KATCH_MCARDLE',
  ],
  ONE_RM: ['ONERM_EPLEY1985', 'ONERM_BRZYCKI1993'],
} as const satisfies Record<MethodPurpose, readonly string[]>;

export const PREFERENCE_SOURCES = ['PLATFORM', 'ORGANIZATION', 'PATIENT'] as const;

/** PUT …/method-preferences/…: el método debe ser uno de METHODS_BY_PURPOSE de su propósito. DELETE vuelve al nivel de arriba. */
export const setMethodPreferenceSchema = z.object({ methodCode: z.string() });
export type SetMethodPreference = z.infer<typeof setMethodPreferenceSchema>;

const effectivePreferenceSchema = z.object({
  purpose: z.enum(METHOD_PURPOSES),
  /** null: la población no tiene método por defecto para ese propósito. */
  methodCode: z.string().nullable(),
  source: z.enum(PREFERENCE_SOURCES),
});

/**
 * GET /api/v1/organization/method-preferences: la tabla vigente por población. La de la plataforma sale del motor
 * (METHODS_BY_POPULATION); la organización la cambia con PUT /api/v1/organization/method-preferences/:population/:purpose
 * (OWNER y ADMIN).
 */
export const organizationMethodPreferencesResponseSchema = z.object({
  populations: z.array(
    z.object({
      population: z.enum(POPULATIONS),
      preferences: z.array(effectivePreferenceSchema),
    }),
  ),
});
export type OrganizationMethodPreferencesResponse = z.infer<
  typeof organizationMethodPreferencesResponseSchema
>;

/**
 * GET /api/v1/patients/:patientId/method-preferences: lo vigente para el paciente según su población. PUT y DELETE en
 * /api/v1/patients/:patientId/method-preferences/:purpose (equipo con escritura). No recalcula nada (RN-D08).
 */
export const patientMethodPreferencesResponseSchema = z.object({
  population: z.enum(POPULATIONS),
  preferences: z.array(effectivePreferenceSchema),
});
export type PatientMethodPreferencesResponse = z.infer<
  typeof patientMethodPreferencesResponseSchema
>;
