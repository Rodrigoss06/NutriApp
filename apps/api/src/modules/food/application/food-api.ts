import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { FOOD_NOT_FOUND } from '../domain/food-errors.js';
import { stateHint, type FoodState } from '../domain/food-state.js';
import {
  composePlate,
  gramsOf,
  type PlateComposition,
  type PlateEntry,
  type PlateItemInput,
} from './plate-composition.js';
import {
  FOOD_STORE,
  type CatalogNutrient,
  type ExchangeListRecord,
  type FoodRecord,
  type FoodStore,
  type FoodSummaryRecord,
} from './ports/food.port.js';

/** El término de búsqueda sin espacios de más y con 80 caracteres como máximo; vacío es null. */
const term = (text: string | null): string | null =>
  text?.replace(/\s+/g, ' ').trim().slice(0, 80) || null;

/**
 * API pública de food (02 §2): el catálogo de alimentos para quien prescribe o registra. Busca sin tildes y por
 * parecido; resuelve un término a candidatos con su puntaje (el registro a mano de P13 y, si se contrata, la captura por
 * foto); y calcula lo que aporta un plato con el motor (RN-E16). Se llama dentro de la transacción de quien la usa: la
 * RLS deja ver los alimentos globales y los de su organización (RN-I01).
 */
@Injectable()
export class FoodApi {
  constructor(@Inject(FOOD_STORE) private readonly foods: FoodStore) {}

  /** Ordenada por parecido; state pone primero los de ese estado. */
  search(
    text: string | null,
    state: FoodState | null = null,
    limit = 20,
  ): Promise<readonly FoodSummaryRecord[]> {
    return this.foods.search({ text: term(text), state, limit });
  }

  /**
   * Candidatos para un término, con su parecido de 0 a 1. Si el término dice el estado («arroz cocido», «pescado
   * crudo»), los de ese estado van primero (RN-E12).
   */
  resolve(text: string, limit = 5): Promise<readonly FoodSummaryRecord[]> {
    const clean = term(text);
    if (clean === null) return Promise.resolve([]);
    return this.foods.search({ text: clean, state: stateHint(clean), limit });
  }

  foodsById(ids: readonly string[]): Promise<readonly FoodRecord[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.foods.byIds([...new Set(ids)]);
  }

  /** El catálogo de nutrientes en el orden en que se muestran. */
  nutrients(): Promise<readonly CatalogNutrient[]> {
    return this.foods.nutrients();
  }

  /** Las listas de intercambio publicadas, con sus grupos (RN-E11). */
  exchangeLists(): Promise<readonly ExchangeListRecord[]> {
    return this.foods.exchangeLists();
  }

  /** Una lista por su id, en cualquier estado: un plan sigue con la versión que usó (RN-E11). */
  exchangeList(id: string): Promise<ExchangeListRecord | null> {
    return this.foods.exchangeList(id);
  }

  /** Lo que aporta un plato; falla si un alimento no existe para la organización o una medida no es suya. */
  async compose(items: readonly PlateItemInput[]): Promise<Result<PlateComposition, DomainError>> {
    const found = new Map((await this.foodsById(items.map((i) => i.foodId))).map((f) => [f.id, f]));
    const entries: PlateEntry[] = [];
    for (const item of items) {
      const food = found.get(item.foodId);
      if (!food) return err(FOOD_NOT_FOUND);
      const grams = gramsOf(food, item);
      if (!grams.ok) return grams;
      entries.push({ food, ...grams.value });
    }
    return ok(composePlate(entries, await this.foods.nutrients()));
  }
}
