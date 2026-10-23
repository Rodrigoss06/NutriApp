import { z } from 'zod';
import { engineIssueSchema } from '../methods/issue.js';
import { FOOD_STATES } from './catalog.js';

/** Una receta no se borra: se archiva y deja de ofrecerse al prescribir. */
export const RECIPE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

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
 * Un ingrediente: gramos de parte comestible en el estado del alimento (RN-E12). La medida casera con que se ingresó
 * («1 taza») solo se muestra; los gramos son los que cuentan.
 */
export const recipeIngredientRequestSchema = z.strictObject({
  foodId: z.uuid(),
  grams: z.number().gt(0).max(99_999),
  householdText: optionalText(120),
});

/**
 * POST /api/v1/recipes, PUT /api/v1/recipes/:id (If-Match) y POST /api/v1/recipes/preview: una receta de la
 * organización (RF-21). Los ingredientes reemplazan a los anteriores, en su orden.
 */
export const recipeRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  servings: z.number().gt(0).max(1_000),
  /** Peso de la preparación cocida, para el factor de rendimiento (RN-E12). */
  cookedWeightG: z.number().gt(0).max(99_999).nullable().default(null),
  instructions: optionalText(5_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ingredients: z.array(recipeIngredientRequestSchema).min(1).max(50),
});
export type RecipeRequest = z.infer<typeof recipeRequestSchema>;

/** GET /api/v1/recipes?q=arroz&status=ACTIVE&limit=20: sin tildes ni mayúsculas, ordenada por parecido. */
export const recipeSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(RECIPE_STATUSES).default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RecipeSearchQuery = z.infer<typeof recipeSearchQuerySchema>;

export const recipeSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  servings: z.number(),
  status: z.enum(RECIPE_STATUSES),
  tags: z.array(z.string()),
  ingredientCount: z.number().int(),
  /** kcal por porción; null es «sin dato» (RN-I03). */
  energyKcalPerServing: z.number().nullable(),
});
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

export const recipeListResponseSchema = z.object({ recipes: z.array(recipeSummarySchema) });
export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;

/** Un ingrediente con su alimento: el estado dice si los gramos son crudos o cocidos (RN-E12). */
export const recipeIngredientSchema = z.object({
  position: z.number().int(),
  foodId: z.uuid(),
  name: z.string(),
  sourceCode: z.string(),
  state: z.enum(FOOD_STATES),
  own: z.boolean(),
  grams: z.number(),
  householdText: z.string().nullable(),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/**
 * Un nutriente por porción, en el orden del catálogo y sin redondear (RN-D09). perServing es «sin dato» (null) si le
 * falta a algún ingrediente (RN-I03); knownPerServing suma lo que sí se conoce y missingIngredients dice en cuántos
 * ingredientes falta, para mostrar «al menos X · falta en N de M» (ADR-061).
 */
export const recipeNutrientSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  core: z.boolean(),
  perServing: z.number().nullable(),
  knownPerServing: z.number(),
  missingIngredients: z.number().int(),
  /** Con el peso cocido: por 100 g de la preparación cocida. */
  per100gCooked: z.number().nullable(),
});
export type RecipeNutrient = z.infer<typeof recipeNutrientSchema>;

/** Lo que calcula el motor con RECIPE_NUTRIENTS, con el método, la versión y el hash de los insumos (RN-D01). */
export const recipeCalculationSchema = z.object({
  methodCode: z.string(),
  methodVersion: z.string(),
  engineVersion: z.string(),
  inputsHash: z.string(),
  ingredientCount: z.number().int(),
  /** Σ gramos de los ingredientes en su estado. */
  rawWeightG: z.number(),
  /** Peso cocido ÷ peso de los ingredientes; null sin peso cocido. */
  yieldFactor: z.number().nullable(),
  nutrients: z.array(recipeNutrientSchema),
  issues: z.array(engineIssueSchema),
});
export type RecipeCalculation = z.infer<typeof recipeCalculationSchema>;

/** GET /api/v1/recipes/:id: la receta con sus ingredientes y sus nutrientes por porción. */
export const recipeDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  servings: z.number(),
  cookedWeightG: z.number().nullable(),
  instructions: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.enum(RECIPE_STATUSES),
  ingredients: z.array(recipeIngredientSchema),
  calculation: recipeCalculationSchema,
  /** Para If-Match al editar, archivar o restaurar. */
  version: z.number().int(),
});
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;

/** POST /api/v1/recipes/preview: lo que daría la receta, sin guardarla. */
export const recipePreviewResponseSchema = z.object({
  ingredients: z.array(recipeIngredientSchema),
  calculation: recipeCalculationSchema,
});
export type RecipePreviewResponse = z.infer<typeof recipePreviewResponseSchema>;
