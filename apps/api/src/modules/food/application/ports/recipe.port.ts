import type { Recipe, RecipeStatus } from '../../domain/recipe.js';
import type { RecipeNutrients } from '../recipe-nutrients.js';

/** Una receta en una búsqueda, con su parecido al término: de 0 a 1. */
export interface RecipeSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly servings: number;
  readonly status: RecipeStatus;
  readonly tags: readonly string[];
  readonly ingredientCount: number;
  /** kcal por porción de la caché; null es «sin dato» (RN-I03). */
  readonly energyKcalPerServing: number | null;
  readonly score: number;
}

/** Una receta de la organización con su caché de nutrientes (null si nunca se calculó). */
export interface RecipeRecord extends Recipe {
  readonly id: string;
  readonly organizationId: string;
  readonly status: RecipeStatus;
  readonly version: number;
  readonly nutrients: RecipeNutrients | null;
}

export interface RecipeSearch {
  /** Ya sin espacios de más; null: sin término. */
  readonly text: string | null;
  readonly status: RecipeStatus;
  readonly limit: number;
}

export interface NewRecipe extends Recipe {
  readonly id: string;
  readonly organizationId: string;
  readonly createdBy: string;
  readonly nutrients: RecipeNutrients;
}

/** food.recipe y sus ingredientes, con la transacción de quien llama: la RLS deja ver solo las de su organización. */
export interface RecipeStore {
  search(query: RecipeSearch): Promise<readonly RecipeSummaryRecord[]>;
  byIds(ids: readonly string[]): Promise<readonly RecipeRecord[]>;
  insert(recipe: NewRecipe): Promise<void>;
  /** Reemplaza la receta y sus ingredientes si la versión coincide; si no, false. */
  update(id: string, version: number, recipe: Recipe, nutrients: RecipeNutrients): Promise<boolean>;
  /** Archiva o restaura si la versión coincide; si no, false. */
  setStatus(id: string, version: number, status: RecipeStatus): Promise<boolean>;
  /** Las recetas de la organización que usan el alimento, archivadas o no. */
  usingFood(foodId: string): Promise<readonly RecipeRecord[]>;
  /** Solo la caché: no es una edición de la receta, así que no cambia su versión. */
  saveNutrients(id: string, nutrients: RecipeNutrients): Promise<void>;
}

export const RECIPE_STORE = Symbol.for('nutricoach.food.RecipeStore');
