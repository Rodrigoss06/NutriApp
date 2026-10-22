import { err, ok, type Result } from '@nutricoach/shared-kernel';
import {
  MAX_PER_100G,
  type CatalogFood,
  type NutrientUnit,
  type NutrientValue,
} from './catalog-food.js';
import { stateFromName } from './food-state.js';

/** Las 22 columnas de la TPCA 2017 en su orden, con el identificador INFOODS de su Anexo 1 (ADR-052). */
export const TPCA_NUTRIENTS = [
  'ENERC_KCAL',
  'ENERC_KJ',
  'WATER',
  'PROCNT',
  'FAT',
  'CHOCDF',
  'CHOAVL',
  'FIBTG',
  'ASH',
  'CA',
  'P',
  'ZN',
  'FE',
  'CARTBEQ',
  'VITA',
  'THIA',
  'RIBF',
  'NIA',
  'VITC',
  'FOL',
  'NA',
  'K',
] as const;
type TpcaNutrient = (typeof TPCA_NUTRIENTS)[number];

/** Encabezado de seeds/food/tpca-2017.csv. */
export const TPCA_COLUMNS = [
  'codigo',
  'grupo',
  'nombre',
  'imputado_de',
  ...TPCA_NUTRIENTS,
] as const;

/** Los grupos que se cargan: el S, de preparaciones, queda fuera por ahora (decisión de Rodrigo, 2026-10-20). */
const TPCA_GROUPS: readonly string[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'Q',
  'T',
  'U',
];

/** La leyenda de asteriscos de la publicación: de qué tabla se imputó el alimento. */
const IMPUTED_SOURCES: readonly string[] = [
  'Tabla INCAP 2012',
  'Tabla Boliviana 2005',
  'Tabla Uruguaya',
  'FAO',
];

const UNIT: Readonly<Record<TpcaNutrient, NutrientUnit>> = {
  ENERC_KCAL: 'kcal',
  ENERC_KJ: 'kJ',
  WATER: 'g',
  PROCNT: 'g',
  FAT: 'g',
  CHOCDF: 'g',
  CHOAVL: 'g',
  FIBTG: 'g',
  ASH: 'g',
  CA: 'mg',
  P: 'mg',
  ZN: 'mg',
  FE: 'mg',
  CARTBEQ: 'µg',
  VITA: 'µg',
  THIA: 'mg',
  RIBF: 'mg',
  NIA: 'mg',
  VITC: 'mg',
  FOL: 'µg',
  NA: 'mg',
  K: 'mg',
};

const NUMBER = /^\d+(?:\.\d+)?$/;
const CODE = /^[A-Z][1-9]\d{0,2}$/;

/**
 * Una fila de seeds/food/tpca-2017.csv (RN-I03), con las convenciones de la publicación: celda vacía (el «•») es «sin
 * dato» y queda null con MISSING; «tr» son trazas, 0 con TRACE; un cero publicado es cero. Si la TPCA imputó el
 * alimento de otra tabla, sus valores van con IMPUTED y la tabla como etiqueta. El estado sale del nombre (RN-E12).
 */
export function parseTpcaRow(
  record: Readonly<Record<string, string>>,
): Result<CatalogFood, string[]> {
  const errors: string[] = [];
  const code = record.codigo ?? '';
  const group = record.grupo ?? '';
  const name = (record.nombre ?? '').trim();
  const imputedFrom = record.imputado_de ?? '';

  if (!TPCA_GROUPS.includes(group)) {
    errors.push(`grupo: «${group}» no es un grupo de la TPCA 2017 que se cargue`);
  }
  if (!CODE.test(code)) {
    errors.push(`codigo: «${code}» no es un código de la TPCA (grupo y número)`);
  } else if (code.charAt(0) !== group) {
    errors.push(`codigo: «${code}» no corresponde al grupo «${group}»`);
  }
  if (!name) errors.push('nombre: vacío');
  else if (name.length > 200) errors.push('nombre: más de 200 caracteres');
  if (imputedFrom && !IMPUTED_SOURCES.includes(imputedFrom)) {
    errors.push(`imputado_de: «${imputedFrom}» no es una tabla de la leyenda de la TPCA`);
  }

  const nutrients: NutrientValue[] = [];
  for (const nutrientCode of TPCA_NUTRIENTS) {
    const cell = record[nutrientCode] ?? '';
    if (cell === '') {
      nutrients.push({ nutrientCode, valuePer100g: null, flag: 'MISSING' });
    } else if (cell === 'tr') {
      nutrients.push({ nutrientCode, valuePer100g: 0, flag: 'TRACE' });
    } else if (!NUMBER.test(cell)) {
      errors.push(
        `${nutrientCode}: «${cell}» no es un valor (número con punto decimal, «tr» o vacío)`,
      );
    } else {
      const unit = UNIT[nutrientCode];
      const max = MAX_PER_100G[unit];
      const value = Number(cell);
      if (value > max) {
        errors.push(`${nutrientCode}: ${cell} ${unit} supera lo posible en 100 g (${String(max)})`);
      } else {
        nutrients.push({ nutrientCode, valuePer100g: value, flag: imputedFrom ? 'IMPUTED' : null });
      }
    }
  }

  if (errors.length > 0) return err(errors);
  return ok({
    code,
    groupCode: `TPCA_${group}`,
    name,
    state: stateFromName(name),
    tags: imputedFrom ? [`Imputado de ${imputedFrom}`] : [],
    nutrients,
  });
}
