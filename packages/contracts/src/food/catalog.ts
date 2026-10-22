import { z } from 'zod';
import { engineIssueSchema } from '../methods/issue.js';

/** Estado en que valen los nutrientes y los gramos (RN-E12), como food.food.state. */
export const FOOD_STATES = ['RAW', 'COOKED', 'PROCESSED', 'READY'] as const;
export type FoodState = (typeof FOOD_STATES)[number];

/** Calidad de un valor, como food.food_nutrient.value_flag; null: tal como lo publica la fuente (RN-I03). */
export const VALUE_FLAGS = ['MEASURED', 'CALCULATED', 'TRACE', 'MISSING', 'IMPUTED'] as const;

/**
 * Un alimento en una lista: de referencia (solo lectura) o propio de la organización (RN-I01). El código del alimento
 * en su fuente no sale de la API (ADR-055).
 */
export const foodSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sourceCode: z.string(),
  groupName: z.string().nullable(),
  state: z.enum(FOOD_STATES),
  /** Propio de la organización: se edita; los globales no. */
  own: z.boolean(),
  /** kcal por 100 g de parte comestible; null es «sin dato», distinto de cero (RN-I03). */
  energyKcalPer100g: z.number().nullable(),
});
export type FoodSummary = z.infer<typeof foodSummarySchema>;

/**
 * GET /api/v1/foods?q=platano&state=COOKED&limit=20: sin tildes ni mayúsculas, ordenada por parecido; state pone
 * primero los de ese estado. Sin q, los primeros por nombre.
 */
export const foodSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  state: z.enum(FOOD_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FoodSearchQuery = z.infer<typeof foodSearchQuerySchema>;

export const foodListResponseSchema = z.object({ foods: z.array(foodSummarySchema) });
export type FoodListResponse = z.infer<typeof foodListResponseSchema>;

/** Un nutriente por 100 g de parte comestible, con su código INFOODS; value null es «sin dato» (RN-I03). */
export const foodNutrientSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  valuePer100g: z.number().nullable(),
  flag: z.enum(VALUE_FLAGS).nullable(),
  /** Energía, macronutrientes y fibra. */
  core: z.boolean(),
});
export type FoodNutrient = z.infer<typeof foodNutrientSchema>;

/** GET /api/v1/foods/nutrients: el catálogo de nutrientes en su orden, con su código INFOODS y su unidad. */
export const nutrientCatalogResponseSchema = z.object({
  nutrients: z.array(
    z.object({ code: z.string(), name: z.string(), unit: z.string(), core: z.boolean() }),
  ),
});
export type NutrientCatalogResponse = z.infer<typeof nutrientCatalogResponseSchema>;

/** Medida casera: grams es el peso neto, la parte comestible (RN-E12); grossGrams, el de compra. */
export const householdMeasureSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  grams: z.number(),
  grossGrams: z.number().nullable(),
  sourceCode: z.string().nullable(),
});
export type HouseholdMeasure = z.infer<typeof householdMeasureSchema>;

/** Peso crudo = peso cocido × factor, para este alimento crudo (TAFERA 2016). */
export const cookingFactorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  cookingMethod: z.string(),
  cookedToRawFactor: z.number(),
});
export type CookingFactor = z.infer<typeof cookingFactorSchema>;

/**
 * De dónde sale el alimento, con su edición (RN-I02). La licencia queda en la base: la app cita sus fuentes una sola
 * vez, en «Acerca de» (ADR-055).
 */
export const foodSourceSchema = z.object({
  code: z.string(),
  name: z.string(),
  edition: z.string().nullable(),
});

/** GET /api/v1/foods/:id: el alimento con sus 22 nutrientes, sus medidas caseras y sus factores de cocción. */
export const foodDetailSchema = foodSummarySchema.extend({
  ediblePortionPct: z.number(),
  tags: z.array(z.string()),
  source: foodSourceSchema,
  nutrients: z.array(foodNutrientSchema),
  measures: z.array(householdMeasureSchema),
  cookingFactors: z.array(cookingFactorSchema),
  /** Para If-Match al editar un alimento propio. */
  version: z.number().int(),
});
export type FoodDetail = z.infer<typeof foodDetailSchema>;

/**
 * POST /api/v1/foods y PUT /api/v1/foods/:id (If-Match): alimento propio de la organización (RN-I01). Los nutrientes
 * van por su código INFOODS y por 100 g de parte comestible; el que no se envía, o null, queda «sin dato» (RN-I03).
 * Las medidas reemplazan a las anteriores.
 */
export const ownFoodRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  state: z.enum(FOOD_STATES),
  ediblePortionPct: z.number().gt(0).max(100).default(100),
  nutrients: z.record(z.string().regex(/^[A-Z][A-Z_]{0,19}$/), z.number().min(0).nullable()),
  measures: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        grams: z.number().gt(0).max(99_999),
      }),
    )
    .max(30)
    .default([]),
});
export type OwnFoodRequest = z.infer<typeof ownFoodRequestSchema>;

/** Un ingrediente de un plato: gramos de parte comestible, o una medida casera y cuántas (RN-E12). */
export const plateItemSchema = z.union([
  z.strictObject({ foodId: z.uuid(), grams: z.number().gt(0).max(99_999) }),
  z.strictObject({
    foodId: z.uuid(),
    measureId: z.uuid(),
    quantity: z.number().gt(0).max(100),
  }),
]);
export type PlateItem = z.infer<typeof plateItemSchema>;

/** POST /api/v1/foods/composition: lo que aporta un plato (RN-E16), sin guardar nada. */
export const plateCompositionRequestSchema = z.object({
  items: z.array(plateItemSchema).min(1).max(50),
});
export type PlateCompositionRequest = z.infer<typeof plateCompositionRequestSchema>;

/**
 * Totales del plato con el método del motor (RN-D01, RN-D02): un nutriente es «sin dato» (null) si le falta a alguno
 * de sus alimentos (RN-I03). Los valores van sin redondear (RN-D09).
 */
export const plateCompositionResponseSchema = z.object({
  methodCode: z.string(),
  methodVersion: z.string(),
  engineVersion: z.string(),
  inputsHash: z.string(),
  items: z.array(
    z.object({
      foodId: z.uuid(),
      name: z.string(),
      sourceCode: z.string(),
      grams: z.number(),
      measure: z.string().nullable(),
      quantity: z.number().nullable(),
    }),
  ),
  weightG: z.number(),
  totals: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      unit: z.string(),
      core: z.boolean(),
      value: z.number().nullable(),
    }),
  ),
  issues: z.array(engineIssueSchema),
});
export type PlateCompositionResponse = z.infer<typeof plateCompositionResponseSchema>;
