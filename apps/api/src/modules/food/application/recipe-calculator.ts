import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { FOOD_NOT_FOUND } from '../domain/food-errors.js';
import type { Recipe } from '../domain/recipe.js';
import {
  FOOD_STORE,
  type CatalogNutrient,
  type FoodRecord,
  type FoodStore,
} from './ports/food.port.js';
import { RECIPE_STORE, type RecipeStore } from './ports/recipe.port.js';
import { recipeNutrients, type RecipeNutrients } from './recipe-nutrients.js';

export interface RecipeCalculationRecord {
  readonly nutrients: RecipeNutrients;
  /** Los alimentos de la receta, sin repetir. */
  readonly foods: readonly FoodRecord[];
  readonly catalog: readonly CatalogNutrient[];
}

/**
 * Los nutrientes por porción de una receta con sus alimentos de la organización (RN-E12, RN-I01), y la caché de las
 * recetas que usan un alimento propio que cambió. Corre dentro de la transacción de quien llama.
 */
@Injectable()
export class RecipeCalculator {
  constructor(
    @Inject(FOOD_STORE) private readonly foods: FoodStore,
    @Inject(RECIPE_STORE) private readonly recipes: RecipeStore,
  ) {}

  /** Falla si un ingrediente no existe para la organización: un alimento de otra no se ve (RN-A01). */
  async calculate(recipe: Recipe): Promise<Result<RecipeCalculationRecord, DomainError>> {
    const ids = [...new Set(recipe.ingredients.map((i) => i.foodId))];
    const foods = await this.foods.byIds(ids);
    if (foods.length !== ids.length) return err(FOOD_NOT_FOUND);
    const catalog = await this.foods.nutrients();
    return ok({ nutrients: recipeNutrients(recipe, foods, catalog), foods, catalog });
  }

  /**
   * Recalcula la caché de las recetas que usan el alimento, archivadas o no. Los planes publicados no cambian: llevan
   * su snapshot (RN-E15).
   */
  async refreshUsing(foodId: string): Promise<void> {
    for (const recipe of await this.recipes.usingFood(foodId)) {
      const calculation = await this.calculate(recipe);
      if (calculation.ok) await this.recipes.saveNutrients(recipe.id, calculation.value.nutrients);
    }
  }
}
