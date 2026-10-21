import type { FoodState } from './food-state.js';

/** Calidad de un valor, como food.food_nutrient.value_flag; null: tal como lo publica la fuente. */
export type ValueFlag = 'MEASURED' | 'CALCULATED' | 'TRACE' | 'MISSING' | 'IMPUTED';

/** Un nutriente por 100 g de parte comestible: null es «sin dato», distinto de cero (RN-I03). */
export interface NutrientValue {
  readonly nutrientCode: string;
  readonly valuePer100g: number | null;
  readonly flag: ValueFlag | null;
}

/** Un alimento de una fuente global (RN-I01), identificado por su código en esa fuente. */
export interface CatalogFood {
  readonly code: string;
  readonly groupCode: string | null;
  readonly name: string;
  readonly state: FoodState;
  readonly tags: readonly string[];
  readonly nutrients: readonly NutrientValue[];
}
