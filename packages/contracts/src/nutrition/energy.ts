import { z } from 'zod';
import { EVALUATION_LEVELS } from '../assessment/catalog.js';
import { POPULATIONS, SEXES } from '../clinical/patient.js';
import { engineIssueSchema } from '../methods/issue.js';

const isoDate = z.iso.date();

/** Actividad del Compendium 2024 con su MET (exercise.physical_activity). */
export const physicalActivitySchema = z.object({
  code: z.string(),
  majorHeading: z.string(),
  descriptionEs: z.string(),
  met: z.number(),
  sourceVersion: z.string(),
});
export type PhysicalActivity = z.infer<typeof physicalActivitySchema>;

/** GET /api/v1/physical-activities?q=correr: búsqueda sin tildes; sin q, el catálogo completo. */
export const physicalActivityListResponseSchema = z.object({
  activities: z.array(physicalActivitySchema),
});
export type PhysicalActivityListResponse = z.infer<typeof physicalActivityListResponseSchema>;

export const RMR_METHODS = [
  'RMR_MIFFLIN1990',
  'RMR_HB1919',
  'BMR_SCHOFIELD1985',
  'RMR_CUNNINGHAM1980',
  'RMR_KATCH_MCARDLE',
] as const;
export type RmrMethod = (typeof RMR_METHODS)[number];

/** ADDITIVE: el PAL es solo la vida diaria y se suma el ejercicio neto. FACTORIAL: el PAL lo cubre todo (ADR-016). */
export const ENERGY_STRATEGIES = ['ADDITIVE', 'FACTORIAL'] as const;
export const ENERGY_GOALS = [
  'LOSE_FAT',
  'GAIN_MUSCLE',
  'MAINTAIN',
  'RECOMPOSITION',
  'PERFORMANCE',
] as const;

/** PAL de vida diaria (RN-E02). */
export const PAL_RANGE = [1.4, 2.4] as const;

/**
 * GET /api/v1/patients/:patientId/energy-basis?evaluationId=:id (por defecto, la última evaluación cerrada): los datos
 * del cuerpo que usará la prescripción y la TMR con los cinco métodos para elegir (RN-E01, G-13). Cunningham y
 * Katch-McArdle usan la masa libre de grasa del método principal de % de grasa y lo citan.
 */
export const energyBasisResponseSchema = z.object({
  evaluation: z.object({
    id: z.uuid(),
    measuredAt: z.iso.datetime(),
    level: z.enum(EVALUATION_LEVELS).nullable(),
  }),
  sex: z.enum(SEXES),
  /** Edad decimal al medir. */
  ageYears: z.number(),
  population: z.enum(POPULATIONS),
  weightKg: z.number(),
  heightCm: z.number(),
  fatFreeMass: z
    .object({ kg: z.number(), methodCode: z.string(), calculationResultId: z.uuid() })
    .nullable(),
  rmrOptions: z.array(
    z.object({
      methodCode: z.enum(RMR_METHODS),
      methodVersion: z.string(),
      /** null si el método no se puede calcular (ERROR en issues). */
      rmrKcal: z.number().nullable(),
      issues: z.array(engineIssueSchema),
    }),
  ),
  /** Preferencia de TMR del paciente o de la organización, si hay (RN-D05). */
  preferredRmrMethodCode: z.enum(RMR_METHODS).nullable(),
});
export type EnergyBasisResponse = z.infer<typeof energyBasisResponseSchema>;

/**
 * Ajuste por objetivo (RN-E04): en kcal por día (negativo es déficit) o en kg de grasa por mes (negativo es perder;
 * déficit = kg × 7700 ÷ 30). En ambos casos se muestra el ritmo semanal como % del peso.
 */
export const energyAdjustmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('KCAL_PER_DAY'), kcalPerDay: z.number().min(-5000).max(5000) }),
  z.object({ kind: z.literal('FAT_KG_PER_MONTH'), fatKgPerMonth: z.number().min(-20).max(20) }),
]);
export type EnergyAdjustment = z.infer<typeof energyAdjustmentSchema>;

/**
 * POST /api/v1/patients/:patientId/energy-prescriptions (y …/preview, que calcula sin guardar). Una prescripción no
 * se edita: se crea otra. Macronutrientes por RN-E07 (RF-18 se adelanta en P7): proteína por g/kg, grasa como % de las
 * kcal y carbohidratos con lo que queda; si salen negativos no se guarda.
 */
export const createEnergyPrescriptionSchema = z
  .object({
    evaluationId: z.uuid(),
    rmrMethodCode: z.enum(RMR_METHODS),
    strategy: z.enum(ENERGY_STRATEGIES).default('ADDITIVE'),
    pal: z.number().min(PAL_RANGE[0]).max(PAL_RANGE[1]),
    /** Solo con la estrategia aditiva: con la factorial el ejercicio ya está en el PAL. */
    activities: z
      .array(
        z.object({
          activityCode: z.string(),
          minutesPerSession: z.number().positive().max(1440),
          sessionsPerWeek: z.number().positive().max(28),
        }),
      )
      .max(20)
      .default([]),
    goal: z.enum(ENERGY_GOALS),
    adjustment: energyAdjustmentSchema,
    /** % de grasa deseado para el peso objetivo y la fecha estimada (RN-E06); opcional. */
    targetFatPct: z.number().gt(0).lt(100).nullable().default(null),
    proteinGPerKg: z.number().positive().max(10),
    fatPctKcal: z.number().positive().lt(100),
  })
  .refine(({ strategy, activities }) => strategy === 'ADDITIVE' || activities.length === 0, {
    message: 'Con la estrategia factorial el ejercicio ya está en el PAL: no se suman actividades.',
    path: ['activities'],
  });
export type CreateEnergyPrescription = z.input<typeof createEnergyPrescriptionSchema>;

/** Componente calculado por el motor: su método, su versión y sus avisos (02 §7: cada componente cita su método). */
const componentSchema = z.object({
  methodCode: z.string(),
  methodVersion: z.string(),
  inputsHash: z.string(),
  warnings: z.array(engineIssueSchema),
});

export const energyPrescriptionPreviewSchema = z.object({
  patientId: z.uuid(),
  evaluationId: z.uuid(),
  /** Resultado de composición que dio la masa libre de grasa, si se usó. */
  calculationResultId: z.uuid().nullable(),
  sex: z.enum(SEXES),
  ageYears: z.number(),
  weightKg: z.number(),
  heightCm: z.number(),
  fatFreeMassKg: z.number().nullable(),
  fatFreeMassMethodCode: z.string().nullable(),
  rmr: componentSchema.extend({ rmrKcal: z.number() }),
  strategy: z.enum(ENERGY_STRATEGIES),
  pal: z.number(),
  exercise: componentSchema.extend({
    activities: z.array(
      z.object({
        activityCode: z.string(),
        descriptionEs: z.string(),
        met: z.number(),
        minutesPerSession: z.number(),
        sessionsPerWeek: z.number(),
        grossKcalPerSession: z.number(),
        netKcalPerSession: z.number(),
      }),
    ),
    /** Kcal netas de las sesiones de la semana ÷ 7 (RN-E03). */
    dailyAverageNetKcal: z.number(),
  }),
  tee: componentSchema.extend({
    baseKcal: z.number(),
    exerciseKcal: z.number(),
    teeKcal: z.number(),
  }),
  goal: z.enum(ENERGY_GOALS),
  adjustment: componentSchema.extend({
    kind: z.enum(['KCAL_PER_DAY', 'FAT_KG_PER_MONTH']),
    /** Negativo es déficit. */
    adjustmentKcal: z.number(),
    fatKgPerMonth: z.number(),
    weeklyRatePct: z.number(),
  }),
  targetKcal: z.number(),
  /** Peso objetivo y fecha estimada: estimación inicial lineal de 7700 kcal/kg que se recalcula en cada evaluación (RN-E05). */
  projection: componentSchema
    .extend({
      kind: z.literal('INITIAL_ESTIMATE'),
      targetFatPct: z.number(),
      targetWeightKg: z.number(),
      weightChangeKg: z.number(),
      monthsToTarget: z.number().nullable(),
      estimatedDate: isoDate.nullable(),
    })
    .nullable(),
  macros: componentSchema.extend({
    proteinGPerKg: z.number(),
    fatPctKcal: z.number(),
    proteinG: z.number(),
    fatG: z.number(),
    choG: z.number(),
  }),
  engineVersion: z.string(),
  /** SHA-256 del JSON canónico de todos los insumos de la prescripción. */
  inputsHash: z.string(),
});
export type EnergyPrescriptionPreview = z.infer<typeof energyPrescriptionPreviewSchema>;

/** GET /api/v1/energy-prescriptions/:id y respuesta del POST. */
export const energyPrescriptionSchema = energyPrescriptionPreviewSchema.extend({
  id: z.uuid(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type EnergyPrescription = z.infer<typeof energyPrescriptionSchema>;

/** GET /api/v1/patients/:patientId/energy-prescriptions, de la más reciente a la más antigua. */
export const energyPrescriptionListResponseSchema = z.object({
  prescriptions: z.array(
    z.object({
      id: z.uuid(),
      evaluationId: z.uuid(),
      createdAt: z.iso.datetime(),
      goal: z.enum(ENERGY_GOALS),
      rmrMethodCode: z.enum(RMR_METHODS),
      teeKcal: z.number(),
      targetKcal: z.number(),
    }),
  ),
});
export type EnergyPrescriptionListResponse = z.infer<typeof energyPrescriptionListResponseSchema>;
