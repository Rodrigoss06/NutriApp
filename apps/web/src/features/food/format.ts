import { formatNumber } from '@nutricoach/ui';

/** Lo que se muestra cuando la fuente no trae el valor: distinto de cero (RN-I03). */
export const NO_DATA = 'sin dato';

/**
 * Decimales con que la TPCA 2017 publica cada nutriente (seeds/food/tpca-2017.csv). El resto, como el agua, las
 * proteínas o la fibra, con 1. Un alimento propio se muestra igual.
 */
const SOURCE_DIGITS: Readonly<Record<string, number>> = {
  ENERC_KCAL: 0,
  ENERC_KJ: 0,
  CA: 0,
  P: 0,
  CARTBEQ: 0,
  VITA: 0,
  FOL: 0,
  NA: 0,
  K: 0,
  ZN: 2,
  FE: 2,
  THIA: 2,
  RIBF: 2,
  NIA: 2,
  VITC: 2,
};

const formatters = new Map<number, Intl.NumberFormat>();

function withDigits(value: number, digits: number): string {
  let formatter = formatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(digits, formatter);
  }
  return formatter.format(value);
}

/**
 * Un valor por 100 g como lo publica su fuente, con su unidad: es un dato del catálogo, no un resultado (ADR-056).
 * null es «sin dato».
 */
export function formatPer100g(value: number | null, code: string, unit: string): string {
  if (value === null) return NO_DATA;
  return `${withDigits(value, SOURCE_DIGITS[code] ?? 1)} ${unit}`;
}

/**
 * Un total calculado, como el de un plato: kcal y gramos enteros (RN-D09); mg y µg, que RN-D09 no fija, con los
 * decimales de su fuente (ADR-056). null es «sin dato».
 */
export function formatTotal(value: number | null, code: string, unit: string): string {
  if (value === null) return NO_DATA;
  if (unit === 'kcal') return `${formatNumber(value, 'kcal')} kcal`;
  if (unit === 'g') return `${formatNumber(value, 'grams')} g`;
  return `${withDigits(value, SOURCE_DIGITS[code] ?? 1)} ${unit}`;
}

/** Un total que puede tener huecos: value es «sin dato» si falta en alguno; known suma lo conocido (ADR-061). */
export interface TotalWithGaps {
  readonly value: number | null;
  readonly known: number;
  readonly missing: number;
}

/**
 * Un total de un plato o una receta (RN-I03, ADR-061): completo, el total; si falta en algunos de sus `of` alimentos,
 * «al menos» lo conocido y en cuántos falta (si lo conocido suma 0, el 0 a secas: un nutriente no baja de 0); si falta
 * en todos, «sin dato».
 */
export function formatTotalWithGaps(
  total: TotalWithGaps,
  of: number,
  code: string,
  unit: string,
): { text: string; gap: string | null } {
  if (total.value !== null) return { text: formatTotal(total.value, code, unit), gap: null };
  if (total.missing >= of) return { text: NO_DATA, gap: null };
  const known = formatTotal(total.known, code, unit);
  // Lo que redondea a 0 al mostrarse (0.3 g de fibra) tampoco lleva «al menos».
  const zero = formatTotal(0, code, unit);
  return {
    text: total.known > 0 && known !== zero ? `al menos ${known}` : known,
    gap: `falta en ${String(total.missing)} de ${String(of)}`,
  };
}

/** Gramos de una medida casera o de un plato, con 1 decimal como los publica la TAFERA. */
export const formatMeasureGrams = (grams: number): string => `${withDigits(grams, 1)} g`;

const servingsFormatter = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** Porciones de una receta como se escribieron: 2, 2.5 o 0.75, sin ceros de más. */
export const formatServingsCount = (servings: number): string => servingsFormatter.format(servings);

export const formatServings = (servings: number): string =>
  `${formatServingsCount(servings)} ${servings === 1 ? 'porción' : 'porciones'}`;

/** Factor de cocido a crudo, con 2 decimales como los publica la TAFERA. */
export const formatFactor = (factor: number): string => withDigits(factor, 2);
