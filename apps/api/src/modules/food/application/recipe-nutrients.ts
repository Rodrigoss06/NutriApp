import { ENGINE_VERSION, RECIPE_NUTRIENTS, runMethod, type Issue } from '@nutricoach/engine';
import type { Recipe } from '../domain/recipe.js';
import { engineIngredients } from './plate-composition.js';
import type { FoodRecord } from './ports/food.port.js';

/** Un nutriente por porción: value es «sin dato» (null) si le falta a algún ingrediente (RN-I03). */
export interface RecipeNutrientPerServing {
  readonly value: number | null;
  /** La suma de lo que sí se conoce, por porción, para mostrar «al menos» (ADR-061). */
  readonly known: number;
  /** Cuántos ingredientes no traen el dato. */
  readonly missing: number;
}

/**
 * La caché de una receta en food.recipe.nutrients_per_serving: el resultado de RECIPE_NUTRIENTS con su método, su
 * versión, la del motor y el hash de los insumos (RN-D01). Los nutrientes van por su código INFOODS, sin redondear.
 */
export interface RecipeNutrients {
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputsHash: string;
  readonly ingredientCount: number;
  /** Σ gramos de los ingredientes en su estado (RN-E12). */
  readonly rawWeightG: number;
  /** Peso cocido ÷ peso de los ingredientes; null sin peso cocido. */
  readonly yieldFactor: number | null;
  readonly perServing: Readonly<Record<string, RecipeNutrientPerServing>>;
  readonly per100gCooked: Readonly<Record<string, number | null>> | null;
  readonly warnings: readonly Issue[];
}

/**
 * Los nutrientes por porción de una receta con el método RECIPE_NUTRIENTS del motor (RN-E12, RN-E16): cada ingrediente
 * aporta sus gramos × su valor por 100 g ÷ 100, con todos los nutrientes del catálogo. `foods` trae cada alimento de la
 * receta: quien llama ya comprobó que existen para la organización.
 */
export function recipeNutrients(
  recipe: Recipe,
  foods: readonly FoodRecord[],
  nutrients: readonly { readonly code: string }[],
): RecipeNutrients {
  const byId = new Map(foods.map((food) => [food.id, food]));
  const entries = recipe.ingredients.map(({ foodId, grams }) => {
    const food = byId.get(foodId);
    if (!food) throw new Error(`Falta el alimento ${foodId} de la receta.`);
    return { food, grams };
  });
  const run = runMethod(RECIPE_NUTRIENTS, {
    ingredients: engineIngredients(entries, nutrients),
    servings: recipe.servings,
    ...(recipe.cookedWeightG === null ? {} : { cookedWeightG: recipe.cookedWeightG }),
  });
  if (!run.ok)
    throw new Error(`RECIPE_NUTRIENTS no calculó: ${run.errors.map((e) => e.code).join(', ')}`);
  const { result } = run;
  const { outputs } = result;
  return {
    methodCode: result.methodCode,
    methodVersion: result.methodVersion,
    engineVersion: ENGINE_VERSION,
    inputsHash: result.inputsHash,
    ingredientCount: entries.length,
    rawWeightG: outputs.rawWeightG,
    yieldFactor: outputs.yieldFactor,
    perServing: Object.fromEntries(
      nutrients.map(({ code }) => [
        code,
        {
          value: outputs.perServing[code] ?? null,
          known: outputs.knownPerServing[code] ?? 0,
          missing: outputs.missingIngredients[code] ?? 0,
        },
      ]),
    ),
    per100gCooked:
      outputs.per100gCooked === null
        ? null
        : Object.fromEntries(
            nutrients.map(({ code }) => [code, outputs.per100gCooked?.[code] ?? null]),
          ),
    warnings: result.warnings,
  };
}
