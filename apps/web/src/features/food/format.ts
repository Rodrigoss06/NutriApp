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

/** Gramos de una medida casera o de un plato, con 1 decimal como los publica la TAFERA. */
export const formatMeasureGrams = (grams: number): string => `${withDigits(grams, 1)} g`;

/** Factor de cocido a crudo, con 2 decimales como los publica la TAFERA. */
export const formatFactor = (factor: number): string => withDigits(factor, 2);
