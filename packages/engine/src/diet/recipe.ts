import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { mean, sum } from '../stats.js';

/** Valor por 100 g de parte comestible; null es «sin dato», distinto de cero (RN-I03). */
export type NutrientValues = Readonly<Record<string, number | null>>;

export interface RecipeIngredient {
  readonly foodCode?: string;
  /** Gramos de parte comestible en el estado indicado (RN-E12). */
  readonly grams: number;
  readonly per100g: NutrientValues;
}

export interface RecipeInput {
  readonly ingredients: readonly RecipeIngredient[];
  readonly servings: number;
  readonly cookedWeightG?: number;
}

export interface RecipeOutput {
  readonly totals: NutrientValues;
  readonly perServing: NutrientValues;
  readonly rawWeightG: number;
  /** Peso cocido ÷ suma de gramos crudos; null si no se registró el peso cocido. */
  readonly yieldFactor: number | null;
  readonly per100gCooked: NutrientValues | null;
}

const mapValues = (values: NutrientValues, fn: (value: number) => number): NutrientValues =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === null ? null : fn(value)]),
  );

/**
 * Nutrientes de una receta: totales = Σ gramos × valor por 100 g ÷ 100; por porción = totales ÷
 * porciones; con peso cocido, factor de rendimiento y nutrientes por 100 g cocidos (RN-E12, RN-E16).
 */
export const RECIPE_NUTRIENTS = defineMethod<RecipeInput, RecipeOutput>({
  code: 'RECIPE_NUTRIENTS',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['ingredients', 'servings'],
  requiredSites: [],
  citation: 'Suma ponderada por 100 g de parte comestible (TPCA 2017, INS-CENAN); 03 RN-E12',
  validity: [],
  compute: ({ ingredients, servings, cookedWeightG }) => {
    const nutrients = [...new Set(ingredients.flatMap(({ per100g }) => Object.keys(per100g)))];
    const totals: NutrientValues = Object.fromEntries(
      nutrients.map((nutrient) => {
        const contributions = ingredients.map(({ grams, per100g }) => {
          const value = per100g[nutrient];
          return value === null || value === undefined ? null : (grams * value) / 100;
        });
        return [nutrient, contributions.includes(null) ? null : sum(contributions as number[])];
      }),
    );
    const rawWeightG = sum(ingredients.map(({ grams }) => grams));
    const issues: Issue[] = [
      {
        rule: 'RN-E12',
        severity: 'WARNING',
        code: 'NC-ENG-307',
        message: 'La versión 1.0 no aplica factores de retención de micronutrientes al cocinar.',
      },
    ];
    if (!(servings > 0)) {
      issues.push({
        rule: 'RN-E12',
        severity: 'ERROR',
        code: 'NC-ENG-308',
        message: 'Una receta rinde al menos una porción.',
      });
    }
    const cooked = cookedWeightG !== undefined && cookedWeightG > 0 ? cookedWeightG : null;
    return {
      outputs: {
        totals,
        perServing: mapValues(totals, (value) => value / servings),
        rawWeightG,
        yieldFactor: cooked === null ? null : cooked / rawWeightG,
        per100gCooked:
          cooked === null ? null : mapValues(totals, (value) => (value / cooked) * 100),
      },
      issues,
    };
  },
});

/** Rango aceptable de adecuación por defecto; la organización lo configura (RN-E10). */
export const DEFAULT_ADEQUACY_RANGE_PCT = [90, 110] as const;

export interface AdequacyInput {
  readonly prescribed: number;
  /** Uno o más días; con una semana da el promedio y los días en rango (RN-G09). */
  readonly consumedDaily: readonly number[];
  readonly acceptableRangePct?: readonly [number, number];
}

export interface AdequacyOutput {
  readonly averageConsumed: number;
  readonly adequacyPct: number;
  readonly dailyAdequacyPct: readonly number[];
  readonly daysInRange: number;
}

/** Adecuación = consumido ÷ prescrito × 100 (RN-E10). */
export const ADEQUACY = defineMethod<AdequacyInput, AdequacyOutput>({
  code: 'ADEQUACY',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['prescribed', 'consumedDaily'],
  requiredSites: [],
  citation: 'Porcentaje de adecuación, consumido ÷ prescrito × 100; guía de dominio §5.6',
  validity: [],
  compute: ({ prescribed, consumedDaily, acceptableRangePct = DEFAULT_ADEQUACY_RANGE_PCT }) => {
    if (!(prescribed > 0) || consumedDaily.length === 0) {
      return {
        outputs: {
          averageConsumed: Number.NaN,
          adequacyPct: Number.NaN,
          dailyAdequacyPct: [],
          daysInRange: 0,
        },
        issues: [
          {
            rule: 'RN-E10',
            severity: 'ERROR',
            code: 'NC-ENG-309',
            message: 'La adecuación necesita un prescrito positivo y al menos un día de consumo.',
          },
        ],
      };
    }
    const [min, max] = acceptableRangePct;
    const averageConsumed = mean(consumedDaily);
    const dailyAdequacyPct = consumedDaily.map((consumed) => (consumed / prescribed) * 100);
    return {
      outputs: {
        averageConsumed,
        adequacyPct: (averageConsumed / prescribed) * 100,
        dailyAdequacyPct,
        daysInRange: dailyAdequacyPct.filter((pct) => pct >= min && pct <= max).length,
      },
    };
  },
});
