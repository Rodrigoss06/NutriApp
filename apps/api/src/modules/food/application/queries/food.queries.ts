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
import { FOOD_NOT_FOUND } from '../../domain/food-errors.js';
import type { FoodState } from '../../domain/food-state.js';
import { FoodApi } from '../food-api.js';
import type { PlateComposition, PlateItemInput } from '../plate-composition.js';
import type {
  CatalogNutrient,
  ExchangeListRecord,
  FoodRecord,
  FoodSummaryRecord,
} from '../ports/food.port.js';

/** El catálogo de alimentos para las pantallas, en transacciones de solo lectura (RN-I01). */
@Injectable()
export class FoodQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(FoodApi) private readonly foods: FoodApi,
  ) {}

  search(
    context: SecurityContext,
    text: string | null,
    state: FoodState | null,
    limit: number,
  ): Promise<readonly FoodSummaryRecord[]> {
    return this.uow.query(context, () => this.foods.search(text, state, limit));
  }

  detail(context: SecurityContext, id: string): Promise<Result<FoodRecord, DomainError>> {
    return this.uow.query(context, async () => {
      const [food] = await this.foods.foodsById([id]);
      return food ? ok(food) : err(FOOD_NOT_FOUND);
    });
  }

  nutrients(context: SecurityContext): Promise<readonly CatalogNutrient[]> {
    return this.uow.query(context, () => this.foods.nutrients());
  }

  exchangeLists(context: SecurityContext): Promise<readonly ExchangeListRecord[]> {
    return this.uow.query(context, () => this.foods.exchangeLists());
  }

  compose(
    context: SecurityContext,
    items: readonly PlateItemInput[],
  ): Promise<Result<PlateComposition, DomainError>> {
    return this.uow.query(context, () => this.foods.compose(items));
  }
}
