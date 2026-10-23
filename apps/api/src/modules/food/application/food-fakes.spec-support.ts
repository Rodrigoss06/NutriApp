import type { FoodState } from '../domain/food-state.js';
import type { FoodRecord } from './ports/food.port.js';

/** Un recorte del catálogo food.nutrient, en su orden. */
export const NUTRIENTS = [
  { code: 'ENERC_KCAL', name: 'Energía', unit: 'kcal', core: true },
  { code: 'PROCNT', name: 'Proteínas', unit: 'g', core: true },
  { code: 'FIBTG', name: 'Fibra dietaria', unit: 'g', core: true },
] as const;

/** Un alimento sintético con sus valores por 100 g; null es «sin dato». */
export function foodRecord(
  id: string,
  name: string,
  values: Record<string, number | null>,
  state: FoodState = 'COOKED',
): FoodRecord {
  return {
    id,
    name,
    sourceCode: 'TPCA_2017',
    sourceFoodCode: id,
    groupName: null,
    state,
    own: false,
    energyKcalPer100g: values.ENERC_KCAL ?? null,
    organizationId: null,
    ediblePortionPct: 100,
    tags: [],
    version: 0,
    source: { code: 'TPCA_2017', name: 'TPCA', edition: null },
    nutrients: NUTRIENTS.map((n) => ({
      ...n,
      nutrientCode: n.code,
      valuePer100g: values[n.code] ?? null,
      flag: values[n.code] === null ? 'MISSING' : null,
    })),
    measures: [
      { id: 'm-taza', name: 'Taza', grams: 150, grossGrams: null, sourceCode: 'TAFERA_2016' },
    ],
    cookingFactors: [],
  };
}
