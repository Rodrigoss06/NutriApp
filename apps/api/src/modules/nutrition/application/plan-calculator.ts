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
import {
  EXCHANGE_GROUP_CODES,
  EXCHANGE_LIST_UNAVAILABLE,
  invalidPlan,
  type ExchangeGroupCode,
  type PlanDraftInput,
} from '../domain/nutrition-plan.js';
import {
  calculatePlan,
  classicGroups,
  type PlanCalculation,
  type PlanList,
  type PlanTargets,
} from './plan-calculation.js';
import type { EnergyPrescriptionRecord } from './ports/nutrition.ports.js';

export interface CalculatedPlan {
  readonly calculation: PlanCalculation;
  readonly targets: PlanTargets;
  readonly list: PlanList;
  /** El nombre de cada alimento permitido, por su id. */
  readonly foodNames: ReadonlyMap<string, string>;
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
 * (RN-E11), los alimentos permitidos visibles para la organización (RN-I01) y el rango de adecuación de tenancy
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
    const foodNames = new Map(found.map((food) => [food.id, food.name]));
    if (foodNames.size < ids.length) {
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
    return ok({ calculation: calculation.value, targets, list: list.value, foodNames });
  }
}
