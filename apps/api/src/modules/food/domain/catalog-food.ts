import type { FoodState } from './food-state.js';

/** Calidad de un valor, como food.food_nutrient.value_flag; null: tal como lo publica la fuente. */
export type ValueFlag = 'MEASURED' | 'CALCULATED' | 'TRACE' | 'MISSING' | 'IMPUTED';

/** Un nutriente por 100 g de parte comestible: null es «sin dato», distinto de cero (RN-I03). */
export interface NutrientValue {
  readonly nutrientCode: string;
  readonly valuePer100g: number | null;
  readonly flag: ValueFlag | null;
}

/** Unidades de los nutrientes de food.nutrient. */
export type NutrientUnit = 'kcal' | 'kJ' | 'g' | 'mg' | 'µg';

/**
 * Lo que cabe en 100 g: 100 g de grasa dan 900 kcal (3766 kJ) y ninguna masa pasa de los 100 g. Los µg los limita el
 * tipo de la columna. Detecta columnas corridas y errores de tipeo; no son límites clínicos.
 */
export const MAX_PER_100G: Readonly<Record<NutrientUnit, number>> = {
  kcal: 900,
  kJ: 3766,
  g: 100,
  mg: 100_000,
  µg: 99_999_999,
};

/** Un alimento de una fuente global (RN-I01), identificado por su código en esa fuente. */
export interface CatalogFood {
  readonly code: string;
  readonly groupCode: string | null;
  readonly name: string;
  readonly state: FoodState;
  readonly tags: readonly string[];
  readonly nutrients: readonly NutrientValue[];
}
