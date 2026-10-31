import { Inject, Injectable } from '@nestjs/common';
import { ClinicalApi } from '../../clinical/index.js';
import { FoodApi } from '../../food/index.js';
import {
  excludedFoodProblems,
  planFoodUses,
  planRecipeIds,
  type FoodExclusion,
} from '../domain/food-exclusion.js';
import type { PlanDraft } from '../domain/food-plan.js';
import { FOOD_EXCLUSION_STORE, type FoodExclusionStore } from './ports/nutrition.ports.js';

/**
 * Lo que una dieta no puede llevar (RN-E17), para los comandos y las consultas de los planes. Corre en la transacción de
 * quien llama, una lectura tras otra.
 */
@Injectable()
export class FoodExclusions {
  constructor(
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(FoodApi) private readonly foods: FoodApi,
    @Inject(FOOD_EXCLUSION_STORE) private readonly store: FoodExclusionStore,
  ) {}

  /** Las alergias e intolerancias activas con sus alimentos: una resuelta deja de excluir, y sus enlaces se conservan. */
  async ofPatient(patientId: string): Promise<readonly FoodExclusion[]> {
    const conditions = await this.clinical.dietaryConditions(patientId);
    const links = await this.store.forPatient(patientId);
    return conditions.map((condition) => ({
      conditionId: condition.id,
      kind: condition.kind,
      label: condition.label,
      foodIds: links.filter((l) => l.conditionId === condition.id).map((l) => l.foodId),
    }));
  }

  /** Lo que el borrador lleva y no puede llevar; vacío si nada. Las recetas ya deben existir: las validó el cálculo. */
  async problems(patientId: string, draft: PlanDraft): Promise<readonly string[]> {
    const exclusions = await this.ofPatient(patientId);
    const excludedIds = exclusions.flatMap((exclusion) => exclusion.foodIds);
    if (excludedIds.length === 0) return [];
    const recipes = await this.foods.recipesById(planRecipeIds(draft));
    const contents = new Map(
      recipes.map((recipe) => [
        recipe.id,
        { name: recipe.name, foodIds: recipe.ingredients.map((i) => i.foodId) },
      ]),
    );
    const foods = await this.foods.foodsById(excludedIds);
    return excludedFoodProblems(
      planFoodUses(draft, contents),
      exclusions,
      new Map(foods.map((food) => [food.id, food.name])),
    );
  }
}
