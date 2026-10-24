import { z } from 'zod';
import { FOOD_STATES } from '../food/catalog.js';
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

/** Intercambios (RF-19), composición (RF-20) y menú semanal (RF-21): se elige al crear el plan y no cambia. */
export const PLAN_MODALITIES = ['EXCHANGES', 'COMPOSITION', 'WEEKLY_MENU'] as const;
export type PlanModality = (typeof PLAN_MODALITIES)[number];

const servings = z.number().int().min(0).max(99);
const householdText = z.string().trim().min(1).max(120).nullable();
const hydrationTargetMl = z.number().int().min(1).max(10_000).nullable();
const instructions = z.string().trim().max(2_000).nullable();

/**
 * POST /api/v1/patients/:id/nutrition-plans: un borrador nuevo con las metas de una prescripción (RF-18). Solo los
 * intercambios llevan lista (RN-E11).
 */
export const createNutritionPlanSchema = z.discriminatedUnion('modality', [
  z.object({
    modality: z.literal('EXCHANGES'),
    energyPrescriptionId: z.uuid(),
    exchangeListId: z.uuid(),
  }),
  z.object({ modality: z.literal('COMPOSITION'), energyPrescriptionId: z.uuid() }),
  z.object({ modality: z.literal('WEEKLY_MENU'), energyPrescriptionId: z.uuid() }),
]);
export type CreateNutritionPlan = z.infer<typeof createNutritionPlanSchema>;

/** Un alimento que el paciente puede elegir en un tiempo y grupo, con su porción (RN-G05). */
export const allowedFoodSchema = z.object({
  groupCode: z.enum(EXCHANGE_GROUPS),
  foodId: z.uuid(),
  grams: z.number().gt(0).max(9_999),
  householdText,
});
export type AllowedFood = z.infer<typeof allowedFoodSchema>;

/** Un tiempo de comida con su parte de la meta del día; los tiempos suman 100 (RN-E09). */
export const mealHeaderSchema = z.object({
  slotCode: z.enum(MEAL_SLOTS),
  name: z.string().trim().min(1).max(60),
  /** HH:MM, hora local del paciente. */
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  sharePct: z.number().min(0).max(100),
});
export type MealHeader = z.infer<typeof mealHeaderSchema>;

export const planMealInputSchema = mealHeaderSchema.extend({
  allowedFoods: z.array(allowedFoodSchema).max(60),
});
export type PlanMealInput = z.infer<typeof planMealInputSchema>;

/** Un alimento con sus gramos de parte comestible en el estado indicado (RN-E12) y su medida casera, si se quiere. */
export const foodItemSchema = z.object({
  itemType: z.literal('FOOD'),
  foodId: z.uuid(),
  grams: z.number().gt(0).max(9_999),
  householdText,
});
export type FoodItem = z.infer<typeof foodItemSchema>;

/** Una receta del recetario, en porciones (RN-E16). */
export const recipeItemSchema = z.object({
  itemType: z.literal('RECIPE'),
  recipeId: z.uuid(),
  servings: z.number().gt(0).max(99),
});
export type RecipeItem = z.infer<typeof recipeItemSchema>;

export const menuItemSchema = z.discriminatedUnion('itemType', [foodItemSchema, recipeItemSchema]);
export type MenuItem = z.infer<typeof menuItemSchema>;

/**
 * PUT /api/v1/nutrition-plans/:id con If-Match: el borrador entero, de la modalidad del plan.
 * - fixedServings: verduras, frutas y lácteos del día; el motor despeja el resto (RN-E08).
 * - overrides: ajuste a mano de almidones, carnes o grasas.
 * - splitOverrides: el reparto a mano de un grupo, un valor por tiempo de comida y en su orden (RN-E09).
 */
export const updateExchangePlanSchema = z.object({
  modality: z.literal('EXCHANGES'),
  fixedServings: z.object({ VEG: servings, FRU: servings, MILK: servings }),
  overrides: z.object({ STA: servings, MEAT: servings, FAT: servings }).partial(),
  meals: z.array(planMealInputSchema).min(1).max(8),
  splitOverrides: z.partialRecord(z.enum(EXCHANGE_GROUPS), z.array(servings).max(8)),
  hydrationTargetMl,
  instructions,
});
export type UpdateExchangePlan = z.infer<typeof updateExchangePlanSchema>;

/** Dieta por composición (RF-20): alimentos con gramos en cada tiempo de comida. */
export const updateCompositionPlanSchema = z.object({
  modality: z.literal('COMPOSITION'),
  meals: z
    .array(mealHeaderSchema.extend({ items: z.array(foodItemSchema).max(40) }))
    .min(1)
    .max(8),
  hydrationTargetMl,
  instructions,
});
export type UpdateCompositionPlan = z.infer<typeof updateCompositionPlanSchema>;

/** Lo de un tiempo en un día del menú: la opción A y, si se quiere, una B para cambiarla. */
export const menuCellInputSchema = z.object({
  optionA: z.array(menuItemSchema).max(20),
  optionB: z.array(menuItemSchema).max(20),
});
export type MenuCellInput = z.infer<typeof menuCellInputSchema>;

/**
 * Menú semanal (RF-21): los tiempos de comida, iguales los siete días, y de lunes a domingo una celda por tiempo, en su
 * orden, con alimentos o recetas.
 */
export const updateWeeklyMenuPlanSchema = z.object({
  modality: z.literal('WEEKLY_MENU'),
  meals: z.array(mealHeaderSchema).min(1).max(8),
  days: z.array(z.object({ meals: z.array(menuCellInputSchema).max(8) })).length(7),
  hydrationTargetMl,
  instructions,
});
export type UpdateWeeklyMenuPlan = z.infer<typeof updateWeeklyMenuPlanSchema>;

export const updateNutritionPlanSchema = z.discriminatedUnion('modality', [
  updateExchangePlanSchema,
  updateCompositionPlanSchema,
  updateWeeklyMenuPlanSchema,
]);
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

/** Las metas exactas de la prescripción (RN-E07, RN-D09). */
const targetsSchema = z.object({
  kcal: z.number(),
  choG: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
});

/** Lo que tiene todo plan, de cualquier modalidad. */
const planBaseSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  lineageId: z.uuid(),
  versionNo: z.number().int(),
  status: z.enum(PLAN_STATUSES),
  energyPrescriptionId: z.uuid(),
  targets: targetsSchema,
  /** Cada cálculo con su método (RN-D01, RN-D02). */
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

/** GET /api/v1/nutrition-plans/:id de un plan por intercambios: lo que calcula el motor y lo que falta para publicarlo. */
export const exchangeNutritionPlanSchema = planBaseSchema.extend({
  modality: z.literal('EXCHANGES'),
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
    mealHeaderSchema.extend({
      id: z.uuid(),
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
});
export type ExchangeNutritionPlan = z.infer<typeof exchangeNutritionPlanSchema>;

/** Un nutriente del catálogo, en el orden en que se muestra. */
const planNutrientSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  core: z.boolean(),
});

/**
 * Un total de nutriente: null es «sin dato» si a algún alimento le falta (RN-I03); known es lo que sí se conoce y
 * missing, en cuántos alimentos falta, para mostrar «al menos» (ADR-061).
 */
export const nutrientTotalSchema = z.object({
  value: z.number().nullable(),
  known: z.number(),
  missing: z.number().int(),
});
export type NutrientTotal = z.infer<typeof nutrientTotalSchema>;

/** Los totales de un tiempo o un día, por código INFOODS, sin redondear (RN-E16, RN-D09). */
export const itemTotalsSchema = z.object({
  /** De cuántos alimentos sale el total (una receta cuenta sus ingredientes): el «de M» de «falta en N de M». */
  ingredientCount: z.number().int(),
  nutrients: z.record(z.string(), nutrientTotalSchema),
});
export type ItemTotals = z.infer<typeof itemTotalsSchema>;

/**
 * Adecuación de composición y menú (RN-E10): con lo que se conoce, si a un alimento le falta el macronutriente se
 * muestra «al menos» (ADR-062). En el menú es la del promedio de los siete días.
 */
const foodAdequacySchema = z.object({
  /** % sin redondear (RN-D09). */
  pct: z.number(),
  daysInRange: z.number().int(),
  days: z.number().int(),
  /** Composición: alimentos sin el dato; menú: días con algún alimento sin el dato. Con 0, la adecuación es exacta. */
  missing: z.number().int(),
  of: z.number().int(),
});

const foodAdequacyBlockSchema = z.object({
  rangePct: z.tuple([z.number(), z.number()]),
  kcal: foodAdequacySchema,
  cho: foodAdequacySchema,
  protein: foodAdequacySchema,
  fat: foodAdequacySchema,
});

/** Energía, macronutrientes y fibra, por código INFOODS; null es «sin dato» (RN-I03). */
const coreValues = z.record(z.string(), z.number().nullable());

export const foodItemViewSchema = foodItemSchema.extend({
  foodName: z.string(),
  state: z.enum(FOOD_STATES),
  nutrientsPer100g: coreValues,
});

export const recipeItemViewSchema = recipeItemSchema.extend({
  recipeName: z.string(),
  nutrientsPerServing: coreValues,
});

export const menuItemViewSchema = z.discriminatedUnion('itemType', [
  foodItemViewSchema,
  recipeItemViewSchema,
]);
export type MenuItemView = z.infer<typeof menuItemViewSchema>;

const compositionMealSchema = mealHeaderSchema.extend({
  name: z.string(),
  timeOfDay: z.string().nullable(),
  sharePct: z.number(),
  items: z.array(foodItemViewSchema),
  totals: itemTotalsSchema,
});

const compositionCalculation = {
  modality: z.literal('COMPOSITION'),
  targets: targetsSchema,
  nutrients: z.array(planNutrientSchema),
  /** Lo del día. */
  totals: itemTotalsSchema,
  adequacy: foodAdequacyBlockSchema,
  methods: z.array(methodSchema),
  publishProblems: z.array(z.string()),
};

/** GET /api/v1/nutrition-plans/:id de una dieta por composición (RF-20, RN-E16). */
export const compositionNutritionPlanSchema = planBaseSchema.extend({
  ...compositionCalculation,
  meals: z.array(compositionMealSchema.extend({ id: z.uuid() })),
});
export type CompositionNutritionPlan = z.infer<typeof compositionNutritionPlanSchema>;

/** Una celda del menú con lo de cada opción; sin alimentos, sus totales son null. */
const menuCellSchema = z.object({
  optionA: z.array(menuItemViewSchema),
  optionB: z.array(menuItemViewSchema),
  totalsA: itemTotalsSchema.nullable(),
  totalsB: itemTotalsSchema.nullable(),
});

/** El promedio de los siete días: «sin dato» si falta en algún día; missingDays, en cuántos (ADR-062). */
const weeklyAverageSchema = z.object({
  value: z.number().nullable(),
  known: z.number(),
  missingDays: z.number().int(),
});

const weeklyMenuCalculation = {
  modality: z.literal('WEEKLY_MENU'),
  targets: targetsSchema,
  nutrients: z.array(planNutrientSchema),
  /** Por nutriente, con la opción A de cada tiempo. */
  weeklyAverage: z.record(z.string(), weeklyAverageSchema),
  adequacy: foodAdequacyBlockSchema,
  methods: z.array(methodSchema),
  publishProblems: z.array(z.string()),
};

const menuMealsSchema = z.array(
  mealHeaderSchema.extend({
    name: z.string(),
    timeOfDay: z.string().nullable(),
    sharePct: z.number(),
  }),
);

/**
 * GET /api/v1/nutrition-plans/:id de un menú semanal (RF-21, RN-E16): de lunes a domingo, cada día con una celda por
 * tiempo y sus totales con la opción A de cada tiempo.
 */
export const weeklyMenuNutritionPlanSchema = planBaseSchema.extend({
  ...weeklyMenuCalculation,
  meals: menuMealsSchema,
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        meals: z.array(menuCellSchema.extend({ id: z.uuid() })),
        totals: itemTotalsSchema,
      }),
    )
    .length(7),
});
export type WeeklyMenuNutritionPlan = z.infer<typeof weeklyMenuNutritionPlanSchema>;

export const nutritionPlanSchema = z.discriminatedUnion('modality', [
  exchangeNutritionPlanSchema,
  compositionNutritionPlanSchema,
  weeklyMenuNutritionPlanSchema,
]);
export type NutritionPlan = z.infer<typeof nutritionPlanSchema>;

/**
 * POST /api/v1/nutrition-plans/:id/preview, con el cuerpo de PUT: lo que calcula el motor con ese borrador sin guardarlo,
 * para la adecuación en vivo del editor (RN-E10). Los tiempos de comida van en el orden del cuerpo.
 */
export const exchangePlanPreviewSchema = exchangeNutritionPlanSchema
  .pick({
    modality: true,
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
export type ExchangePlanPreview = z.infer<typeof exchangePlanPreviewSchema>;

export const compositionPlanPreviewSchema = z.object({
  ...compositionCalculation,
  meals: z.array(compositionMealSchema),
});
export type CompositionPlanPreview = z.infer<typeof compositionPlanPreviewSchema>;

export const weeklyMenuPlanPreviewSchema = z.object({
  ...weeklyMenuCalculation,
  meals: menuMealsSchema,
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        meals: z.array(menuCellSchema),
        totals: itemTotalsSchema,
      }),
    )
    .length(7),
});
export type WeeklyMenuPlanPreview = z.infer<typeof weeklyMenuPlanPreviewSchema>;

export const nutritionPlanPreviewSchema = z.discriminatedUnion('modality', [
  exchangePlanPreviewSchema,
  compositionPlanPreviewSchema,
  weeklyMenuPlanPreviewSchema,
]);
export type NutritionPlanPreview = z.infer<typeof nutritionPlanPreviewSchema>;

/** GET /api/v1/patients/:id/nutrition-plans: el historial, de lo más reciente a lo más antiguo (RF-23). */
export const nutritionPlanListResponseSchema = z.object({
  plans: z.array(
    z.object({
      id: z.uuid(),
      lineageId: z.uuid(),
      versionNo: z.number().int(),
      modality: z.enum(PLAN_MODALITIES),
      status: z.enum(PLAN_STATUSES),
      /** Solo en intercambios (RN-E11). */
      exchangeListCode: z.string().nullable(),
      exchangeListVersion: z.string().nullable(),
      targetKcal: z.number(),
      createdAt: z.iso.datetime(),
      publishedAt: z.iso.datetime().nullable(),
      validFrom: z.iso.date().nullable(),
    }),
  ),
});
export type NutritionPlanListResponse = z.infer<typeof nutritionPlanListResponseSchema>;
