import type { NutrientValue } from '../../domain/catalog-food.js';
import type { FoodState } from '../../domain/food-state.js';
import type { NutrientDefinition, OwnFood } from '../../domain/own-food.js';

/** Un alimento en una búsqueda, con su parecido al término: de 0 a 1. */
export interface FoodSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceCode: string;
  readonly sourceFoodCode: string | null;
  readonly groupName: string | null;
  readonly state: FoodState;
  /** Propio de la organización (RN-I01). */
  readonly own: boolean;
  /** kcal por 100 g; null es «sin dato» (RN-I03). */
  readonly energyKcalPer100g: number | null;
  readonly score: number;
}

/** Un nutriente del catálogo food.nutrient, en el orden en que se muestra. */
export interface CatalogNutrient extends NutrientDefinition {
  readonly name: string;
  readonly core: boolean;
}

export interface FoodNutrientRecord extends NutrientValue {
  readonly name: string;
  readonly unit: string;
  readonly core: boolean;
}

export interface FoodRecord extends Omit<FoodSummaryRecord, 'score'> {
  readonly organizationId: string | null;
  readonly ediblePortionPct: number;
  readonly tags: readonly string[];
  readonly version: number;
  readonly source: {
    readonly code: string;
    readonly name: string;
    readonly edition: string | null;
    readonly license: string;
  };
  /** Los del catálogo, en su orden. */
  readonly nutrients: readonly FoodNutrientRecord[];
  readonly measures: readonly {
    readonly id: string;
    readonly name: string;
    readonly grams: number;
    readonly grossGrams: number | null;
    readonly sourceCode: string | null;
  }[];
  readonly cookingFactors: readonly {
    readonly id: string;
    readonly name: string;
    readonly cookingMethod: string;
    readonly cookedToRawFactor: number;
  }[];
}

export interface FoodSearch {
  /** Ya sin espacios de más; null: sin término. */
  readonly text: string | null;
  /** Los de este estado van primero. */
  readonly state: FoodState | null;
  readonly limit: number;
}

export interface NewOwnFood extends OwnFood {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly createdBy: string;
}

/**
 * Alimentos globales y de la organización activa, con la transacción de quien llama: la RLS deja ver los globales y
 * los propios, y escribir solo los propios (RN-I01).
 */
export interface FoodStore {
  search(query: FoodSearch): Promise<readonly FoodSummaryRecord[]>;
  byIds(ids: readonly string[]): Promise<readonly FoodRecord[]>;
  nutrients(): Promise<readonly CatalogNutrient[]>;
  /** El siguiente código de alimento propio de la organización: 1, 2, 3… */
  nextOwnCode(organizationId: string): Promise<string>;
  insertOwn(food: NewOwnFood): Promise<void>;
  /** Reemplaza el alimento propio y sus medidas si la versión coincide; si no, false. */
  updateOwn(id: string, version: number, food: OwnFood): Promise<boolean>;
}

export const FOOD_STORE = Symbol.for('nutricoach.food.FoodStore');
