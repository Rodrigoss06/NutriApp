import { Inject, Injectable } from '@nestjs/common';
import type { CatalogFood } from '../../domain/catalog-food.js';
import { FOOD_CATALOG_STORE, type FoodCatalogStore } from '../ports/food-catalog.port.js';

/** Guarda los alimentos de una fuente global dentro de la transacción del lote de importación (RN-I01, RN-I04). */
@Injectable()
export class SaveSourceFoodsHandler {
  constructor(@Inject(FOOD_CATALOG_STORE) private readonly store: FoodCatalogStore) {}

  execute(sourceCode: string, foods: readonly CatalogFood[]): Promise<void> {
    return this.store.upsertSourceFoods(sourceCode, foods);
  }
}
