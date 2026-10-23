import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ok,
  UNIT_OF_WORK,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { RECIPE_NOT_FOUND } from '../../domain/food-errors.js';
import { recipe, type Recipe, type RecipeInput, type RecipeStatus } from '../../domain/recipe.js';
import {
  FOOD_STORE,
  type CatalogNutrient,
  type FoodRecord,
  type FoodStore,
} from '../ports/food.port.js';
import { RECIPE_STORE, type RecipeStore, type RecipeSummaryRecord } from '../ports/recipe.port.js';
import { RecipeCalculator } from '../recipe-calculator.js';
import type { RecipeNutrients } from '../recipe-nutrients.js';

/** Una receta con lo necesario para mostrarla: sus alimentos y el catálogo de nutrientes en su orden. */
export interface RecipeView {
  readonly recipe: Recipe;
  readonly nutrients: RecipeNutrients;
  readonly foods: readonly FoodRecord[];
  readonly catalog: readonly CatalogNutrient[];
}

/** El término de búsqueda sin espacios de más y con 80 caracteres como máximo; vacío es null. */
const term = (text: string | null): string | null =>
  text?.replace(/\s+/g, ' ').trim().slice(0, 80) || null;

/** El recetario para las pantallas, en transacciones de solo lectura (RF-21). */
@Injectable()
export class RecipeQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RECIPE_STORE) private readonly recipes: RecipeStore,
    @Inject(FOOD_STORE) private readonly foods: FoodStore,
    @Inject(RecipeCalculator) private readonly calculator: RecipeCalculator,
  ) {}

  search(
    context: SecurityContext,
    text: string | null,
    status: RecipeStatus,
    limit: number,
  ): Promise<readonly RecipeSummaryRecord[]> {
    return this.uow.query(context, () => this.recipes.search({ text: term(text), status, limit }));
  }

  /** Con su caché; si nunca se calculó, se calcula para mostrarla, sin guardar. */
  detail(
    context: SecurityContext,
    id: string,
  ): Promise<Result<RecipeView & { status: RecipeStatus; version: number }, DomainError>> {
    return this.uow.query(context, async () => {
      const [found] = await this.recipes.byIds([id]);
      if (!found) return err(RECIPE_NOT_FOUND);
      const foods = await this.foods.byIds([...new Set(found.ingredients.map((i) => i.foodId))]);
      const catalog = await this.foods.nutrients();
      let nutrients = found.nutrients;
      if (nutrients === null) {
        const calculation = await this.calculator.calculate(found);
        if (!calculation.ok) return calculation;
        nutrients = calculation.value.nutrients;
      }
      return ok({
        recipe: found,
        nutrients,
        foods,
        catalog,
        status: found.status,
        version: found.version,
      });
    });
  }

  /** Lo que daría la receta, sin guardar nada (RN-E12). */
  preview(context: SecurityContext, input: RecipeInput): Promise<Result<RecipeView, DomainError>> {
    return this.uow.query(context, async () => {
      const valid = recipe(input);
      if (!valid.ok) return valid;
      const calculation = await this.calculator.calculate(valid.value);
      if (!calculation.ok) return calculation;
      return ok({ recipe: valid.value, ...calculation.value });
    });
  }
}
