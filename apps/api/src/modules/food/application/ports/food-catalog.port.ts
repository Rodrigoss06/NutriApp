import type { CatalogFood } from '../../domain/catalog-food.js';
import type { CatalogCookingFactor, CatalogMeasure } from '../../domain/catalog-measure.js';

/**
 * Catálogos globales de una fuente (RN-I01, RN-I03): alimentos en food.food y food.food_nutrient, medidas caseras en
 * food.household_measure y factores de cocción en food.cooking_factor. Cada método corre en la transacción del lote,
 * como SYSTEM, inserta o actualiza por el código de la fila en su fuente y deja la fecha de importación en food.source.
 */
export interface FoodCatalogStore {
  /** Los alimentos, con todos sus nutrientes. */
  upsertSourceFoods(sourceCode: string, foods: readonly CatalogFood[]): Promise<void>;
  /** Las medidas, cada una con el alimento global de foodSourceCode al que apunta; falla si falta alguno. */
  upsertSourceMeasures(
    sourceCode: string,
    foodSourceCode: string,
    measures: readonly CatalogMeasure[],
  ): Promise<void>;
  /** Los factores, cada uno con el alimento crudo global de foodSourceCode al que apunta; falla si falta alguno. */
  upsertCookingFactors(
    sourceCode: string,
    foodSourceCode: string,
    factors: readonly CatalogCookingFactor[],
  ): Promise<void>;
}

export const FOOD_CATALOG_STORE = Symbol.for('nutricoach.food.FoodCatalogStore');
