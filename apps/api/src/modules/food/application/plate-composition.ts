import { ENGINE_VERSION, RECIPE_NUTRIENTS, runMethod, type Issue } from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { MEASURE_NOT_OF_FOOD } from '../domain/food-errors.js';
import type { FoodRecord } from './ports/food.port.js';

/** Un ingrediente del plato: gramos de parte comestible, o una medida casera y cuántas. */
export type PlateItemInput =
  | { readonly foodId: string; readonly grams: number }
  | { readonly foodId: string; readonly measureId: string; readonly quantity: number };

export interface PlateEntry {
  readonly food: FoodRecord;
  readonly grams: number;
  readonly measure: string | null;
  readonly quantity: number | null;
}

export interface PlateComposition {
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputsHash: string;
  readonly items: readonly {
    readonly foodId: string;
    readonly name: string;
    readonly sourceCode: string;
    readonly grams: number;
    readonly measure: string | null;
    readonly quantity: number | null;
  }[];
  readonly weightG: number;
  readonly totals: readonly {
    readonly code: string;
    readonly name: string;
    readonly unit: string;
    readonly core: boolean;
    readonly value: number | null;
  }[];
  readonly issues: readonly Issue[];
}

/** Los gramos de parte comestible de un ingrediente: los que trae, o los de su medida por la cantidad (RN-E12). */
export function gramsOf(
  food: FoodRecord,
  item: PlateItemInput,
): Result<{ grams: number; measure: string | null; quantity: number | null }, DomainError> {
  if ('grams' in item) return ok({ grams: item.grams, measure: null, quantity: null });
  const measure = food.measures.find((m) => m.id === item.measureId);
  if (!measure) return err(MEASURE_NOT_OF_FOOD);
  return ok({
    grams: measure.grams * item.quantity,
    measure: measure.name,
    quantity: item.quantity,
  });
}

/**
 * Lo que aporta un plato (RN-E16) con el método RECIPE_NUTRIENTS del motor, como una receta de una porción: cada total
 * es Σ gramos × valor por 100 g ÷ 100, y es «sin dato» si le falta a alguno de sus alimentos (RN-I03). No se guarda:
 * es una vista previa, con el método, la versión y el hash de los insumos (RN-D01).
 */
export function composePlate(
  entries: readonly PlateEntry[],
  nutrients: readonly { code: string; name: string; unit: string; core: boolean }[],
): PlateComposition {
  const ingredients = entries.map(({ food, grams }) => ({
    foodCode: food.id,
    grams,
    per100g: Object.fromEntries(
      nutrients.map(({ code }) => [
        code,
        food.nutrients.find((n) => n.nutrientCode === code)?.valuePer100g ?? null,
      ]),
    ),
  }));
  const run = runMethod(RECIPE_NUTRIENTS, { ingredients, servings: 1 });
  if (!run.ok)
    throw new Error(`RECIPE_NUTRIENTS no calculó: ${run.errors.map((e) => e.code).join(', ')}`);
  const { result } = run;
  return {
    methodCode: result.methodCode,
    methodVersion: result.methodVersion,
    engineVersion: ENGINE_VERSION,
    inputsHash: result.inputsHash,
    items: entries.map(({ food, grams, measure, quantity }) => ({
      foodId: food.id,
      name: food.name,
      sourceCode: food.sourceCode,
      grams,
      measure,
      quantity,
    })),
    weightG: result.outputs.rawWeightG,
    totals: nutrients.map(({ code, name, unit, core }) => ({
      code,
      name,
      unit,
      core,
      value: result.outputs.totals[code] ?? null,
    })),
    issues: result.warnings,
  };
}
