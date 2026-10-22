import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { MAX_PER_100G, type NutrientUnit, type NutrientValue } from './catalog-food.js';
import type { FoodState } from './food-state.js';

/** Un nutriente del catálogo food.nutrient, con su unidad. */
export interface NutrientDefinition {
  readonly code: string;
  readonly unit: NutrientUnit;
}

/** Lo que manda quien crea o edita un alimento propio, ya validado en su forma por el contrato. */
export interface OwnFoodInput {
  readonly name: string;
  readonly state: FoodState;
  readonly ediblePortionPct: number;
  /** Por 100 g de parte comestible y por código INFOODS; null es «sin dato». */
  readonly nutrients: Readonly<Record<string, number | null>>;
  readonly measures: readonly { readonly name: string; readonly grams: number }[];
}

/** Un alimento propio listo para guardar: todos los nutrientes del catálogo, en su orden (RN-I03). */
export interface OwnFood {
  readonly name: string;
  readonly state: FoodState;
  readonly ediblePortionPct: number;
  readonly nutrients: readonly NutrientValue[];
  readonly measures: readonly { readonly name: string; readonly grams: number }[];
}

export const INVALID_OWN_FOOD = 'NC-FOOD-001';

/** Más de 100 g de macronutrientes en 100 g, con 1 g de margen para el redondeo de una etiqueta. */
const MAX_MACROS_G = 101;

const key = (name: string): string =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Un alimento propio de la organización (RN-I01). Guarda todos los nutrientes del catálogo: lo que no se envía queda
 * «sin dato» con MISSING, distinto de cero (RN-I03). Rechaza lo que no cabe en 100 g, un nutriente que el catálogo no
 * tiene, un alimento sin ningún nutriente y dos medidas con el mismo nombre.
 */
export function ownFood(
  input: OwnFoodInput,
  catalog: readonly NutrientDefinition[],
): Result<OwnFood, DomainError> {
  const problems: string[] = [];
  const known = new Map(catalog.map((nutrient) => [nutrient.code, nutrient]));
  for (const code of Object.keys(input.nutrients)) {
    if (!known.has(code)) problems.push(`${code} no es un nutriente del catálogo.`);
  }
  for (const { code, unit } of catalog) {
    const value = input.nutrients[code];
    if (typeof value === 'number' && value > MAX_PER_100G[unit]) {
      problems.push(
        `${code}: ${String(value)} ${unit} no cabe en 100 g (máximo ${String(MAX_PER_100G[unit])}).`,
      );
    }
  }
  const grams = (code: string) => input.nutrients[code] ?? 0;
  const macros = grams('PROCNT') + grams('FAT') + (input.nutrients.CHOCDF ?? grams('CHOAVL'));
  if (macros > MAX_MACROS_G) {
    problems.push(`Proteínas, grasa y carbohidratos suman ${String(macros)} g en 100 g.`);
  }
  const values = catalog.filter(({ code }) => typeof input.nutrients[code] === 'number');
  if (values.length === 0 && problems.length === 0) {
    problems.push('Ingresa al menos un nutriente por 100 g.');
  }
  const seen = new Set<string>();
  for (const measure of input.measures) {
    const name = key(measure.name);
    if (seen.has(name)) problems.push(`Dos medidas se llaman «${name}».`);
    seen.add(name);
  }

  if (problems.length > 0) {
    return err(
      domainError({
        code: INVALID_OWN_FOOD,
        rule: 'RN-I03',
        message: 'Revisa los nutrientes y las medidas del alimento.',
        details: { problems },
      }),
    );
  }
  return ok({
    name: input.name,
    state: input.state,
    ediblePortionPct: input.ediblePortionPct,
    nutrients: catalog.map(({ code }): NutrientValue => {
      const value = input.nutrients[code];
      return typeof value === 'number'
        ? { nutrientCode: code, valuePer100g: value, flag: null }
        : { nutrientCode: code, valuePer100g: null, flag: 'MISSING' };
    }),
    measures: input.measures.map(({ name, grams: g }) => ({ name, grams: g })),
  });
}
