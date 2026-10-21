import { Inject, Injectable } from '@nestjs/common';
import type { CatalogMeasure } from '../../domain/catalog-measure.js';
import { FOOD_CATALOG_STORE, type FoodCatalogStore } from '../ports/food-catalog.port.js';

/**
 * Guarda las medidas caseras de una fuente global, enlazadas con los alimentos de otra, dentro de la transacción del
 * lote de importación (RN-I01, RN-I04).
 */
@Injectable()
export class SaveSourceMeasuresHandler {
  constructor(@Inject(FOOD_CATALOG_STORE) private readonly store: FoodCatalogStore) {}

  execute(
    sourceCode: string,
    foodSourceCode: string,
    measures: readonly CatalogMeasure[],
  ): Promise<void> {
    return this.store.upsertSourceMeasures(sourceCode, foodSourceCode, measures);
  }
}
