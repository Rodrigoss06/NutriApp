import { z } from 'zod';
import { upToDecimals } from '../decimals.js';

/** Evaluaciones de postura y de pruebas físicas (RF-41, 07 §3.3 y §4): heredan evaluador, fecha, cierre y enmienda. */
export const FUNCTIONAL_KINDS = ['MOVEMENT', 'FITNESS'] as const;
export type FunctionalKind = (typeof FUNCTIONAL_KINDS)[number];

export const PHYSICAL_MOMENTS = ['BASELINE', 'WEEK_4', 'WEEK_8', 'WEEK_12', 'RETEST'] as const;
export type PhysicalMoment = (typeof PHYSICAL_MOMENTS)[number];
export const PHYSICAL_MOMENT_LABELS = {
  BASELINE: 'Inicial',
  WEEK_4: 'Semana 4',
  WEEK_8: 'Semana 8',
  WEEK_12: 'Semana 12',
  RETEST: 'Retest',
} as const satisfies Record<PhysicalMoment, string>;

export const EVALUATION_MODALITIES = ['IN_PERSON', 'ONLINE', 'HYBRID'] as const;
export type EvaluationModality = (typeof EVALUATION_MODALITIES)[number];
export const EVALUATION_MODALITY_LABELS = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrida',
} as const satisfies Record<EvaluationModality, string>;

/** Estado de una prueba física (07 §4): se calcula al leer, con la inicial y la de la semana 12. */
export const PHYSICAL_TEST_STATUSES = ['PENDING', 'BASELINE_RECORDED', 'REVIEW_CHANGE'] as const;
export type PhysicalTestStatus = (typeof PHYSICAL_TEST_STATUSES)[number];
export const PHYSICAL_TEST_STATUS_LABELS = {
  PENDING: 'PENDIENTE',
  BASELINE_RECORDED: 'BASE REGISTRADA',
  REVIEW_CHANGE: 'REVISAR CAMBIO',
} as const satisfies Record<PhysicalTestStatus, string>;

export const PHYSICAL_DOMAIN_LABELS = {
  MOBILITY: 'Movilidad',
  MUSCULAR_ENDURANCE: 'Resistencia muscular',
  CORE: 'Tronco',
  STRENGTH: 'Fuerza',
  POWER: 'Potencia',
  AEROBIC: 'Capacidad aeróbica',
  PERFORMANCE: 'Rendimiento',
} as const satisfies Record<string, string>;

export const MOVEMENT_TEST_KIND_LABELS = {
  STATIC: 'Estática',
  DYNAMIC: 'Dinámica',
} as const satisfies Record<string, string>;

/** Las dos listas de pruebas, en su orden; son catálogos globales, no datos de un paciente. */
export const functionalCatalogResponseSchema = z.object({
  movementTests: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      kind: z.enum(['STATIC', 'DYNAMIC']),
      region: z.string(),
    }),
  ),
  physicalTests: z.array(
    z.object({
      code: z.string(),
      domain: z.string(),
      name: z.string(),
      protocol: z.string(),
      unit: z.string(),
    }),
  ),
});
export type FunctionalCatalogResponse = z.infer<typeof functionalCatalogResponseSchema>;

/** POST /api/v1/patients/:id/functional-evaluations: las pruebas físicas llevan su momento; la postura, no. */
export const createFunctionalEvaluationSchema = z
  .strictObject({
    kind: z.enum(FUNCTIONAL_KINDS),
    measuredAt: z.iso.datetime(),
    moment: z.enum(PHYSICAL_MOMENTS).nullable().default(null),
    notes: z.string().trim().max(2_000).nullable().default(null),
  })
  .refine(({ kind, moment }) => (kind === 'FITNESS') === (moment !== null), {
    message: 'Las pruebas físicas llevan su momento; la postura, no.',
    path: ['moment'],
  });
export type CreateFunctionalEvaluation = z.input<typeof createFunctionalEvaluationSchema>;

const note = (max: number) => z.string().trim().max(max).nullable().default(null);
/** La evidencia también puede ser un enlace a una carpeta restringida (07 §4): solo https. */
const evidenceUrl = z
  .url({ protocol: /^https$/ })
  .max(500)
  .nullable()
  .default(null);
const sideScore = z.number().int().min(0).max(2).nullable().default(null);

/** PUT /api/v1/functional-evaluations/:id/movement/:testCode con If-Match: 0 a 2 por lado; sin puntaje, null (07 §3.3). */
export const saveMovementTestSchema = z.strictObject({
  rightScore: sideScore,
  leftScore: sideScore,
  pain: z.boolean().default(false),
  asymmetry: z.boolean().default(false),
  modality: z.enum(EVALUATION_MODALITIES).default('IN_PERSON'),
  observation: note(1_000),
  actionNote: note(1_000),
  reliabilityNote: note(300),
  evidenceUrl,
});
export type SaveMovementTest = z.input<typeof saveMovementTestSchema>;

/** PUT /api/v1/functional-evaluations/:id/physical/:testCode con If-Match. */
export const savePhysicalResultSchema = z.strictObject({
  value: z.number().min(0).max(999_999).refine(upToDecimals(2), 'Usa hasta 2 decimales.'),
  modality: z.enum(EVALUATION_MODALITIES).default('IN_PERSON'),
  notes: note(1_000),
  evidenceUrl,
});
export type SavePhysicalResult = z.input<typeof savePhysicalResultSchema>;

/** POST /api/v1/functional-evaluations/:id/amend: cerrada, solo se enmienda con su motivo (RN-D08). */
export const amendFunctionalEvaluationSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});

export const functionalEvaluationSummarySchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  kind: z.enum(FUNCTIONAL_KINDS),
  moment: z.enum(PHYSICAL_MOMENTS).nullable(),
  status: z.enum(['DRAFT', 'CLOSED', 'AMENDED']),
  revision: z.number().int(),
  measuredAt: z.iso.datetime(),
  localDate: z.iso.date(),
  closedAt: z.iso.datetime().nullable(),
  evaluatorMemberId: z.uuid(),
  amendReason: z.string().nullable(),
  amendedByEvaluationId: z.uuid().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
});
export type FunctionalEvaluationSummary = z.infer<typeof functionalEvaluationSummarySchema>;

export const functionalEvaluationListResponseSchema = z.object({
  evaluations: z.array(functionalEvaluationSummarySchema),
});
export type FunctionalEvaluationListResponse = z.infer<
  typeof functionalEvaluationListResponseSchema
>;

const evidence = {
  hasEvidenceFile: z.boolean(),
  evidenceUrl: z.string().nullable(),
  modality: z.enum(EVALUATION_MODALITIES),
};

export const movementTestResultSchema = z.object({
  testCode: z.string(),
  rightScore: z.number().int().nullable(),
  leftScore: z.number().int().nullable(),
  pain: z.boolean(),
  asymmetry: z.boolean(),
  status: z.enum(['PENDING', 'REFER', 'MODIFY', 'CAUTION', 'FIT']),
  ruleVersion: z.string(),
  observation: z.string().nullable(),
  actionNote: z.string().nullable(),
  reliabilityNote: z.string().nullable(),
  ...evidence,
});
export type MovementTestResult = z.infer<typeof movementTestResultSchema>;

export const physicalTestResultSchema = z.object({
  testCode: z.string(),
  value: z.number(),
  unit: z.string(),
  notes: z.string().nullable(),
  ...evidence,
});
export type PhysicalTestResult = z.infer<typeof physicalTestResultSchema>;

export const functionalEvaluationSchema = functionalEvaluationSummarySchema.extend({
  movementTests: z.array(movementTestResultSchema),
  physicalResults: z.array(physicalTestResultSchema),
});
export type FunctionalEvaluation = z.infer<typeof functionalEvaluationSchema>;

/** GET /api/v1/patients/:id/physical-test-summary: cada prueba por momento, con su cambio y su estado (07 §4). */
export const physicalTestSummaryResponseSchema = z.object({
  tests: z.array(
    z.object({
      testCode: z.string(),
      baseline: z.number().nullable(),
      week4: z.number().nullable(),
      week8: z.number().nullable(),
      week12: z.number().nullable(),
      retest: z.number().nullable(),
      /** Semana 12 menos inicial; sin las dos, null. */
      change: z.number().nullable(),
      status: z.enum(PHYSICAL_TEST_STATUSES),
    }),
  ),
});
export type PhysicalTestSummaryResponse = z.infer<typeof physicalTestSummaryResponseSchema>;
