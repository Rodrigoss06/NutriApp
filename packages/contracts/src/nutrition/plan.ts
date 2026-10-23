import { z } from 'zod';
import { engineIssueSchema } from '../methods/issue.js';

/** Grupos del método clásico (RN-E08), en el orden de la lista. */
export const EXCHANGE_GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
export type ExchangeGroupCode = (typeof EXCHANGE_GROUPS)[number];

/** Los que fija el profesional; el motor despeja almidones, carnes y grasas (RN-E08). */
export const FIXED_GROUPS = ['VEG', 'FRU', 'MILK'] as const;
export const SOLVED_GROUPS = ['STA', 'MEAT', 'FAT'] as const;

export const MEAL_SLOTS = [
  'BREAKFAST',
  'MID_MORNING',
  'LUNCH',
  'AFTERNOON',
  'DINNER',
  'CUSTOM',
] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const PLAN_STATUSES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

const servings = z.number().int().min(0).max(99);

/** POST /api/v1/patients/:id/nutrition-plans: un borrador nuevo con las metas de una prescripción (RF-18, RF-19). */
export const createNutritionPlanSchema = z.object({
  energyPrescriptionId: z.uuid(),
  exchangeListId: z.uuid(),
});
export type CreateNutritionPlan = z.infer<typeof createNutritionPlanSchema>;

/** Un alimento que el paciente puede elegir en un tiempo y grupo, con su porción (RN-G05). */
export const allowedFoodSchema = z.object({
  groupCode: z.enum(EXCHANGE_GROUPS),
  foodId: z.uuid(),
  grams: z.number().gt(0).max(9_999),
  householdText: z.string().trim().min(1).max(120).nullable(),
});
export type AllowedFood = z.infer<typeof allowedFoodSchema>;

export const planMealInputSchema = z.object({
  slotCode: z.enum(MEAL_SLOTS),
  name: z.string().trim().min(1).max(60),
  /** HH:MM, hora local del paciente. */
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  sharePct: z.number().min(0).max(100),
  allowedFoods: z.array(allowedFoodSchema).max(60),
});
export type PlanMealInput = z.infer<typeof planMealInputSchema>;

/**
 * PUT /api/v1/nutrition-plans/:id con If-Match: el borrador entero.
 * - fixedServings: verduras, frutas y lácteos del día; el motor despeja el resto (RN-E08).
 * - overrides: ajuste a mano de almidones, carnes o grasas.
 * - splitOverrides: el reparto a mano de un grupo, un valor por tiempo de comida y en su orden (RN-E09).
 */
export const updateNutritionPlanSchema = z.object({
  fixedServings: z.object({ VEG: servings, FRU: servings, MILK: servings }),
  overrides: z.object({ STA: servings, MEAT: servings, FAT: servings }).partial(),
  meals: z.array(planMealInputSchema).min(1).max(8),
  splitOverrides: z.partialRecord(z.enum(EXCHANGE_GROUPS), z.array(servings).max(8)),
  hydrationTargetMl: z.number().int().min(1).max(10_000).nullable(),
  instructions: z.string().trim().max(2_000).nullable(),
});
export type UpdateNutritionPlan = z.infer<typeof updateNutritionPlanSchema>;

const methodSchema = z.object({
  methodCode: z.string(),
  methodVersion: z.string(),
  inputsHash: z.string(),
  warnings: z.array(engineIssueSchema),
});

const adequacySchema = z.object({
  /** % sin redondear (RN-D09). */
  pct: z.number(),
  inRange: z.boolean(),
});

/** GET /api/v1/nutrition-plans/:id: el plan con lo que calcula el motor y lo que falta para publicarlo. */
export const nutritionPlanSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  lineageId: z.uuid(),
  versionNo: z.number().int(),
  status: z.enum(PLAN_STATUSES),
  energyPrescriptionId: z.uuid(),
  exchangeList: z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    version: z.string(),
    provisional: z.boolean(),
    groups: z.array(
      z.object({
        code: z.enum(EXCHANGE_GROUPS),
        name: z.string(),
        choG: z.number(),
        proteinG: z.number(),
        fatG: z.number(),
        kcal: z.number(),
      }),
    ),
  }),
  /** Las metas exactas de la prescripción (RN-E07, RN-D09). */
  targets: z.object({
    kcal: z.number(),
    choG: z.number(),
    proteinG: z.number(),
    fatG: z.number(),
  }),
  exchanges: z.array(
    z.object({
      groupCode: z.enum(EXCHANGE_GROUPS),
      servings: z.number().int(),
      /** Lo que da el método clásico con los grupos fijos (RN-E08). */
      automatic: z.number().int(),
      manual: z.boolean(),
    }),
  ),
  meals: z.array(
    z.object({
      id: z.uuid(),
      slotCode: z.enum(MEAL_SLOTS),
      name: z.string(),
      timeOfDay: z.string().nullable(),
      sharePct: z.number(),
      servings: z.record(z.enum(EXCHANGE_GROUPS), z.number().int()),
      allowedFoods: z.array(
        allowedFoodSchema.extend({
          foodName: z.string(),
          /** Energía, macronutrientes y fibra por 100 g, por código INFOODS; null es «sin dato» (RN-I03). */
          nutrientsPer100g: z.record(z.string(), z.number().nullable()),
        }),
      ),
    }),
  ),
  /** Grupos con el reparto cambiado a mano (RN-E09). */
  manualSplit: z.array(z.enum(EXCHANGE_GROUPS)),
  totals: z.object({ kcal: z.number(), choG: z.number(), proteinG: z.number(), fatG: z.number() }),
  /** RN-E10: con el rango de la organización. */
  adequacy: z.object({
    rangePct: z.tuple([z.number(), z.number()]),
    kcal: adequacySchema,
    cho: adequacySchema,
    protein: adequacySchema,
    fat: adequacySchema,
  }),
  /** Intercambios, reparto y adecuación: cada uno con su método (RN-D01, RN-D02). */
  methods: z.array(methodSchema),
  hydrationTargetMl: z.number().int().nullable(),
  instructions: z.string().nullable(),
  /** Lo que falta para publicar; vacío si se puede (RN-E13, RN-G05). */
  publishProblems: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  /** Desde qué día vale, en la fecha local del paciente; null mientras es borrador (RN-E14). */
  validFrom: z.iso.date().nullable(),
  /** Para If-Match. */
  version: z.number().int(),
});
export type NutritionPlan = z.infer<typeof nutritionPlanSchema>;

/**
 * POST /api/v1/nutrition-plans/:id/preview, con el cuerpo de PUT: lo que calcula el motor con ese borrador sin guardarlo,
 * para la adecuación en vivo del editor (RN-E10). Los tiempos de comida van en el orden del cuerpo.
 */
export const nutritionPlanPreviewSchema = nutritionPlanSchema
  .pick({
    targets: true,
    exchanges: true,
    manualSplit: true,
    totals: true,
    adequacy: true,
    methods: true,
    publishProblems: true,
  })
  .extend({
    meals: z.array(z.object({ servings: z.record(z.enum(EXCHANGE_GROUPS), z.number().int()) })),
  });
export type NutritionPlanPreview = z.infer<typeof nutritionPlanPreviewSchema>;

/** GET /api/v1/patients/:id/nutrition-plans: el historial, de lo más reciente a lo más antiguo (RF-23). */
export const nutritionPlanListResponseSchema = z.object({
  plans: z.array(
    z.object({
      id: z.uuid(),
      lineageId: z.uuid(),
      versionNo: z.number().int(),
      status: z.enum(PLAN_STATUSES),
      exchangeListCode: z.string(),
      exchangeListVersion: z.string(),
      targetKcal: z.number(),
      createdAt: z.iso.datetime(),
      publishedAt: z.iso.datetime().nullable(),
      validFrom: z.iso.date().nullable(),
    }),
  ),
});
export type NutritionPlanListResponse = z.infer<typeof nutritionPlanListResponseSchema>;
