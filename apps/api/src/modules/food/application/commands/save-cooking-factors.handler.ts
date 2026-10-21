import { Inject, Injectable } from '@nestjs/common';
import type { CatalogCookingFactor } from '../../domain/catalog-measure.js';
import { FOOD_CATALOG_STORE, type FoodCatalogStore } from '../ports/food-catalog.port.js';

/**
 * Guarda los factores de conversión de peso cocido a crudo de una fuente global, enlazados con los alimentos crudos
 * de otra, dentro de la transacción del lote de importación (RN-I01, RN-I04).
 */
@Injectable()
export class SaveCookingFactorsHandler {
  constructor(@Inject(FOOD_CATALOG_STORE) private readonly store: FoodCatalogStore) {}

  execute(
    sourceCode: string,
    foodSourceCode: string,
    factors: readonly CatalogCookingFactor[],
  ): Promise<void> {
    return this.store.upsertCookingFactors(sourceCode, foodSourceCode, factors);
  }
}
