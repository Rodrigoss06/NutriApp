import { z } from 'zod';
import { EVALUATION_LEVELS, SITE_FAMILIES, SITE_UNITS } from './catalog.js';
import { BIA_METRICS, BIA_UNITS, EVALUATION_KINDS } from './evaluation.js';
import { CONDITION_DIFFERENCES, METRIC_CODES, METRIC_UNITS, SIGNIFICANCES } from './results.js';

const isoDate = z.iso.date();

/** Un punto de una serie: su evaluación, su valor y el cambio contra el punto anterior de la misma serie. */
export const evolutionPointSchema = z.object({
  evaluationId: z.uuid(),
  localDate: isoDate,
  value: z.number(),
  change: z.number().nullable(),
  /** Solo en las medidas: el CMD95 del evaluador de este punto (RN-C05). */
  mdc95: z.number().nullable(),
  /** RN-C06 en las medidas; null en un número derivado, al que el CMD95 no se traslada. */
  significance: z.enum(SIGNIFICANCES).nullable(),
});
export type EvolutionPoint = z.infer<typeof evolutionPointSchema>;

/** Del primer punto al último, con el CMD95 del último. */
export const evolutionOverallSchema = z.object({
  change: z.number(),
  mdc95: z.number().nullable(),
  significance: z.enum(SIGNIFICANCES).nullable(),
});

const series = {
  points: z.array(evolutionPointSchema),
  overall: evolutionOverallSchema.nullable(),
};

export const evolutionSiteSeriesSchema = z.object({
  siteCode: z.string(),
  name: z.string(),
  family: z.enum(SITE_FAMILIES),
  unit: z.enum(SITE_UNITS),
  ...series,
});
export type EvolutionSiteSeries = z.infer<typeof evolutionSiteSeriesSchema>;

export const evolutionMetricSeriesSchema = z.object({
  metricCode: z.enum(METRIC_CODES),
  /** Una serie por método: métodos distintos nunca comparten serie (RN-D03). */
  methodCode: z.string(),
  unit: z.enum(METRIC_UNITS),
  ...series,
});
export type EvolutionMetricSeries = z.infer<typeof evolutionMetricSeriesSchema>;

export const evolutionBiaSeriesSchema = z.object({
  /** «Marca · modelo»: la bioimpedancia nunca comparte serie con la antropometría (RN-C08). */
  device: z.string(),
  metric: z.enum(BIA_METRICS),
  deviceLabel: z.string(),
  unit: z.enum(BIA_UNITS),
  ...series,
});
export type EvolutionBiaSeries = z.infer<typeof evolutionBiaSeriesSchema>;

/**
 * GET /api/v1/patients/:id/evolution (RF-35): las evaluaciones cerradas vigentes del paciente en orden, cada sitio medido, la
 * suma de 6 pliegues, cada indicador por método y cada lectura de bioimpedancia por equipo. El cambio de una medida se
 * compara con el CMD95 del evaluador del punto (RN-C06); el de un número derivado, no (RN-C05). Se advierte lo que cambió
 * en las condiciones o el evaluador frente a la evaluación anterior (RN-C09).
 */
export const evolutionResponseSchema = z.object({
  evaluations: z.array(
    z.object({
      evaluationId: z.uuid(),
      localDate: isoDate,
      kind: z.enum(EVALUATION_KINDS),
      level: z.enum(EVALUATION_LEVELS).nullable(),
      revision: z.int(),
      evaluatorMemberId: z.uuid(),
      conditionDifferences: z.array(z.enum(CONDITION_DIFFERENCES)),
    }),
  ),
  sites: z.array(evolutionSiteSeriesSchema),
  skinfoldSum6: z.object(series).nullable(),
  metrics: z.array(evolutionMetricSeriesSchema),
  bia: z.array(evolutionBiaSeriesSchema),
});
export type EvolutionResponse = z.infer<typeof evolutionResponseSchema>;

/** Lo que ve el paciente en Progreso (RF-30, ADR-091): las medidas y los números principales, sin interpretaciones. */
export const PATIENT_EVOLUTION_ITEMS = [
  'WEIGHT',
  'WAIST',
  'HIP',
  'SKINFOLD_SUM6',
  'FAT_PCT',
  'MUSCLE_MASS',
] as const;
export type PatientEvolutionItem = (typeof PATIENT_EVOLUTION_ITEMS)[number];

export const PATIENT_EVOLUTION_LABELS: Readonly<Record<PatientEvolutionItem, string>> = {
  WEIGHT: 'Peso',
  WAIST: 'Cintura',
  HIP: 'Cadera',
  SKINFOLD_SUM6: 'Suma de 6 pliegues',
  FAT_PCT: '% de grasa',
  MUSCLE_MASS: 'Masa muscular',
};

/**
 * GET /api/v1/me/evolution (RF-30): el peso, la cintura, la cadera y la suma de 6 pliegues, con el cambio real o «sin cambio
 * significativo» (RN-C06), y el % de grasa y la masa muscular del método principal del paciente, cada uno con su método
 * (RN-D02). Sin interpretaciones clínicas.
 */
export const patientEvolutionResponseSchema = z.object({
  evaluationCount: z.int().nonnegative(),
  items: z.array(
    z.object({
      item: z.enum(PATIENT_EVOLUTION_ITEMS),
      unit: z.string(),
      /** El método del número: la consolidación de tomas en las medidas, la ecuación en los derivados. */
      methodCode: z.string(),
      ...series,
    }),
  ),
});
export type PatientEvolutionResponse = z.infer<typeof patientEvolutionResponseSchema>;
