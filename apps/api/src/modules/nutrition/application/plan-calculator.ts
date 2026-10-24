import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ok,
  type DomainError,
  type OrganizationId,
  type Result,
} from '@nutricoach/shared-kernel';
import { FoodApi } from '../../food/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import type { CompositionDraft, MenuItem, WeeklyMenuDraft } from '../domain/food-plan.js';
import {
  EXCHANGE_GROUP_CODES,
  EXCHANGE_LIST_UNAVAILABLE,
  invalidPlan,
  type ExchangeGroupCode,
  type PlanDraftInput,
} from '../domain/nutrition-plan.js';
import {
  calculateComposition,
  calculateWeeklyMenu,
  type CompositionCalculation,
  type FoodPlanSources,
  type WeeklyMenuCalculation,
} from './food-plan-calculation.js';
import {
  calculatePlan,
  classicGroups,
  type PlanCalculation,
  type PlanList,
  type PlanTargets,
} from './plan-calculation.js';
import type { EnergyPrescriptionRecord } from './ports/nutrition.ports.js';

/** Un alimento permitido con su nombre y sus nutrientes principales por 100 g; null es «sin dato» (RN-I03). */
export interface PlanFood {
  readonly name: string;
  readonly nutrientsPer100g: Readonly<Record<string, number | null>>;
}

export interface CalculatedPlan {
  readonly calculation: PlanCalculation;
  readonly targets: PlanTargets;
  readonly list: PlanList;
  /** Los alimentos permitidos, por su id. */
  readonly foods: ReadonlyMap<string, PlanFood>;
}

export interface CalculatedComposition {
  readonly calculation: CompositionCalculation;
  readonly targets: PlanTargets;
  readonly sources: FoodPlanSources;
}

export interface CalculatedWeeklyMenu {
  readonly calculation: WeeklyMenuCalculation;
  readonly targets: PlanTargets;
  readonly sources: FoodPlanSources;
}

const outputOf = (values: Readonly<Record<string, unknown>>, key: string): number => {
  const value = values[key];
  if (typeof value !== 'number') throw new Error(`Valor ${key} sin número.`);
  return value;
};

/** Las metas exactas de la prescripción: las del sobre de sus macronutrientes, sin redondear (RN-E07, RN-D09). */
export function targetsOf(prescription: EnergyPrescriptionRecord): PlanTargets {
  const { macros } = prescription.components;
  return {
    kcal: outputOf(macros.inputs, 'targetKcal'),
    choG: outputOf(macros.outputs, 'choG'),
    proteinG: outputOf(macros.outputs, 'proteinG'),
    fatG: outputOf(macros.outputs, 'fatG'),
  };
}

/**
 * Lo que necesita el cálculo de un plan, desde las API públicas: la lista de intercambio de food y su versión
 * (RN-E11), los alimentos y recetas visibles para la organización (RN-I01) y el rango de adecuación de tenancy
 * (RN-E10). Corre en la transacción de quien llama.
 */
@Injectable()
export class PlanCalculator {
  constructor(
    @Inject(FoodApi) private readonly foods: FoodApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  async list(exchangeListId: string): Promise<Result<PlanList, DomainError>> {
    const list = await this.foods.exchangeList(exchangeListId);
    if (!list || !classicGroups(list.groups)) return err(EXCHANGE_LIST_UNAVAILABLE);
    return ok({
      id: list.id,
      code: list.code,
      name: list.name,
      version: list.version,
      provisional: list.provisional,
      groups: list.groups
        .filter((g): g is typeof g & { code: ExchangeGroupCode } =>
          (EXCHANGE_GROUP_CODES as readonly string[]).includes(g.code),
        )
        .map((g) => ({ ...g })),
    });
  }

  async calculate(
    organizationId: OrganizationId,
    prescription: EnergyPrescriptionRecord,
    exchangeListId: string,
    input: PlanDraftInput,
  ): Promise<Result<CalculatedPlan, DomainError>> {
    const list = await this.list(exchangeListId);
    if (!list.ok) return list;
    const ids = [...new Set(input.meals.flatMap((m) => m.allowedFoods.map((f) => f.foodId)))];
    const found = await this.foods.foodsById(ids);
    const foods = new Map<string, PlanFood>(
      found.map((food) => [
        food.id,
        {
          name: food.name,
          nutrientsPer100g: Object.fromEntries(
            food.nutrients.filter((n) => n.core).map((n) => [n.nutrientCode, n.valuePer100g]),
          ),
        },
      ]),
    );
    if (foods.size < ids.length) {
      return err(
        invalidPlan(['Un alimento permitido no existe o no es de tu organización (RN-I01).']),
      );
    }
    const targets = targetsOf(prescription);
    const calculation = calculatePlan(
      input,
      targets,
      list.value,
      await this.tenancy.adequacyRangePct(organizationId),
    );
    if (!calculation.ok) return calculation;
    return ok({ calculation: calculation.value, targets, list: list.value, foods });
  }

  /** Una dieta por composición con sus alimentos (RF-20, RN-E16). */
  async composition(
    organizationId: OrganizationId,
    prescription: EnergyPrescriptionRecord,
    draft: CompositionDraft,
  ): Promise<Result<CalculatedComposition, DomainError>> {
    const sources = await this.#sources(draft.meals.flatMap((meal) => meal.items));
    if (!sources.ok) return sources;
    const targets = targetsOf(prescription);
    const calculation = calculateComposition(
      draft,
      targets,
      sources.value,
      await this.tenancy.adequacyRangePct(organizationId),
    );
    if (!calculation.ok) return calculation;
    return ok({ calculation: calculation.value, targets, sources: sources.value });
  }

  /** Un menú semanal con sus alimentos y recetas (RF-21, RN-E16). */
  async weeklyMenu(
    organizationId: OrganizationId,
    prescription: EnergyPrescriptionRecord,
    draft: WeeklyMenuDraft,
  ): Promise<Result<CalculatedWeeklyMenu, DomainError>> {
    const items = draft.days.flatMap((day) =>
      day.meals.flatMap((cell) => [...cell.optionA, ...cell.optionB]),
    );
    const sources = await this.#sources(items);
    if (!sources.ok) return sources;
    const targets = targetsOf(prescription);
    const calculation = calculateWeeklyMenu(
      draft,
      targets,
      sources.value,
      await this.tenancy.adequacyRangePct(organizationId),
    );
    if (!calculation.ok) return calculation;
    return ok({ calculation: calculation.value, targets, sources: sources.value });
  }

  /**
   * Los alimentos y recetas de un plan, con los ingredientes de cada receta, visibles para la organización (RN-I01), y
   * el catálogo de nutrientes.
   */
  async #sources(items: readonly MenuItem[]): Promise<Result<FoodPlanSources, DomainError>> {
    const recipeIds = [
      ...new Set(items.flatMap((i) => (i.itemType === 'RECIPE' ? [i.recipeId] : []))),
    ];
    const recipes = await this.foods.recipesById(recipeIds);
    if (recipes.length < recipeIds.length) {
      return err(invalidPlan(['Una receta no existe o no es de tu organización (RN-I01).']));
    }
    const foodIds = [
      ...new Set([
        ...items.flatMap((i) => (i.itemType === 'FOOD' ? [i.foodId] : [])),
        ...recipes.flatMap((r) => r.ingredients.map((i) => i.foodId)),
      ]),
    ];
    const foods = await this.foods.foodsById(foodIds);
    if (foods.length < foodIds.length) {
      return err(invalidPlan(['Un alimento no existe o no es de tu organización (RN-I01).']));
    }
    return ok({
      foods: new Map(
        foods.map((food) => [
          food.id,
          {
            name: food.name,
            state: food.state,
            nutrientsPer100g: Object.fromEntries(
              food.nutrients.map((n) => [n.nutrientCode, n.valuePer100g]),
            ),
          },
        ]),
      ),
      recipes: new Map(
        recipes.map((recipe) => [
          recipe.id,
          {
            name: recipe.name,
            servings: recipe.servings,
            ingredients: recipe.ingredients.map(({ foodId, grams }) => ({ foodId, grams })),
          },
        ]),
      ),
      nutrients: (await this.foods.nutrients()).map(({ code, name, unit, core }) => ({
        code,
        name,
        unit,
        core,
      })),
    });
  }
}
