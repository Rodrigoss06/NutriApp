import type { CatalogFood } from '../../domain/catalog-food.js';

/** Alimentos globales de una fuente en food.food y food.food_nutrient (RN-I01, RN-I03). */
export interface FoodCatalogStore {
  /**
   * Inserta o actualiza los alimentos por su código en la fuente, con todos sus nutrientes, y deja la fecha de
   * importación en food.source. Corre en la transacción del lote, como SYSTEM.
   */
  upsertSourceFoods(sourceCode: string, foods: readonly CatalogFood[]): Promise<void>;
}

export const FOOD_CATALOG_STORE = Symbol.for('nutricoach.food.FoodCatalogStore');
