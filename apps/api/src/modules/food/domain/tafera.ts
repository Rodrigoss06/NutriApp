import { err, ok, type Result } from '@nutricoach/shared-kernel';
import type { CatalogCookingFactor, CatalogMeasure } from './catalog-measure.js';

/** Encabezado de seeds/food/tafera-2016-medidas.csv (ADR-053). */
export const TAFERA_MEASURE_COLUMNS = [
  'codigo',
  'codigo_tpca',
  'alimento',
  'unidad',
  'medida',
  'peso_bruto_g',
  'peso_neto_g',
  'parte_comestible_pct',
  'energia_kcal',
  'datos_1985',
] as const;

/** Encabezado de seeds/food/tafera-2016-factores.csv (ADR-053). */
export const TAFERA_FACTOR_COLUMNS = [
  'codigo',
  'codigo_tpca',
  'alimento',
  'coccion',
  'factor',
  'datos_1985',
] as const;

/** Grupo de la TAFERA (1 a 12, el orden de la TPCA 2009) y posición de la medida en él. */
const MEASURE_CODE = /^(?:[1-9]|1[0-2])-[1-9]\d{0,2}$/;
/** La TAFERA no numera su módulo II: el extractor pone II- y el orden de lectura. */
const FACTOR_CODE = /^II-\d{3}$/;
const TPCA_CODE = /^[A-Z][1-9]\d{0,2}$/;
const NUMBER = /^\d+(?:\.\d+)?$/;

/** Lo que cabe en numeric(8,2) y numeric(5,2): detecta columnas corridas. No son límites clínicos. */
const MAX_GRAMS = 999_999.99;
const MAX_FACTOR = 999.99;

type TaferaRecord = Readonly<Record<string, string>>;

function label(record: TaferaRecord, column: string, max: number, errors: string[]): string {
  const value = (record[column] ?? '').trim();
  if (!value) errors.push(`${column}: vacío`);
  else if (value.length > max) errors.push(`${column}: más de ${String(max)} caracteres`);
  return value;
}

function code(
  record: TaferaRecord,
  column: string,
  pattern: RegExp,
  what: string,
  errors: string[],
): string {
  const value = record[column] ?? '';
  if (!pattern.test(value)) errors.push(`${column}: «${value}» no es ${what}`);
  return value;
}

/** Un número positivo; vacío solo si es opcional. */
function positive(
  record: TaferaRecord,
  column: string,
  max: number,
  errors: string[],
  optional = false,
): number | null {
  const cell = record[column] ?? '';
  if (cell === '' && optional) return null;
  if (!NUMBER.test(cell) || Number(cell) <= 0) {
    errors.push(`${column}: «${cell}» no es un número positivo con punto decimal`);
    return null;
  }
  if (Number(cell) > max) {
    errors.push(`${column}: ${cell} no cabe en la columna (${String(max)})`);
    return null;
  }
  return Number(cell);
}

function from1985(record: TaferaRecord, errors: string[]): void {
  const cell = record.datos_1985 ?? '';
  if (cell !== 'si' && cell !== 'no') errors.push(`datos_1985: «${cell}» no es «si» ni «no»`);
}

/**
 * Una fila de seeds/food/tafera-2016-medidas.csv (RN-I04): la medida casera con su peso neto, que es la parte
 * comestible (RN-E12), y el bruto si la fuente lo da, para el alimento de la TPCA 2017 con que se enlazó. alimento y
 * unidad son el texto de la fuente; medida, el nombre que se muestra. El % comestible y la energía de la TAFERA solo se
 * validan: el % sale de los pesos y la energía la calcula el motor con la TPCA 2017.
 */
export function parseTaferaMeasureRow(record: TaferaRecord): Result<CatalogMeasure, string[]> {
  const errors: string[] = [];
  const measureCode = code(
    record,
    'codigo',
    MEASURE_CODE,
    'un código de la TAFERA (grupo-posición)',
    errors,
  );
  const foodCode = code(
    record,
    'codigo_tpca',
    TPCA_CODE,
    'un código de la TPCA (grupo y número)',
    errors,
  );
  label(record, 'alimento', 200, errors);
  label(record, 'unidad', 200, errors);
  const name = label(record, 'medida', 200, errors);
  const grams = positive(record, 'peso_neto_g', MAX_GRAMS, errors);
  const grossGrams = positive(record, 'peso_bruto_g', MAX_GRAMS, errors, true);
  if (grams !== null && grossGrams !== null && grossGrams < grams) {
    errors.push(`peso_bruto_g: ${String(grossGrams)} es menor que el neto (${String(grams)})`);
  }
  const percent = record.parte_comestible_pct ?? '';
  if (percent !== '' && (!NUMBER.test(percent) || Number(percent) <= 0 || Number(percent) > 100)) {
    errors.push(`parte_comestible_pct: «${percent}» no es un porcentaje mayor que 0 y hasta 100`);
  }
  const energy = record.energia_kcal ?? '';
  if (!NUMBER.test(energy))
    errors.push(`energia_kcal: «${energy}» no es un número con punto decimal`);
  from1985(record, errors);

  if (errors.length > 0 || grams === null) return err(errors);
  return ok({ code: measureCode, foodCode, name, grams, grossGrams });
}

/**
 * Una fila de seeds/food/tafera-2016-factores.csv (RN-I04): peso crudo = peso cocido × factor, para el alimento crudo
 * de la TPCA 2017 con que se enlazó. alimento es el nombre de la fuente, con su subgrupo («Pollo, ala»).
 */
export function parseTaferaFactorRow(record: TaferaRecord): Result<CatalogCookingFactor, string[]> {
  const errors: string[] = [];
  const factorCode = code(
    record,
    'codigo',
    FACTOR_CODE,
    'un código del módulo II (II-001)',
    errors,
  );
  const foodCode = code(
    record,
    'codigo_tpca',
    TPCA_CODE,
    'un código de la TPCA (grupo y número)',
    errors,
  );
  const name = label(record, 'alimento', 200, errors);
  const method = label(record, 'coccion', 100, errors);
  const factor = positive(record, 'factor', MAX_FACTOR, errors);
  from1985(record, errors);

  if (errors.length > 0 || factor === null) return err(errors);
  return ok({ code: factorCode, foodCode, name, method, cookedToRawFactor: factor });
}
