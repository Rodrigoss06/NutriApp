import { describe, expect, it } from 'vitest';
import type { CatalogFood } from './catalog-food.js';
import { parseTpcaRow, TPCA_COLUMNS, TPCA_NUTRIENTS } from './tpca-food.js';

/** Fila A7 de la TPCA 2017 (Avena, hojuela cruda), con los 22 valores tal como los trae el CSV. */
const A7: Record<string, string> = {
  codigo: 'A7',
  grupo: 'A',
  nombre: 'Avena, hojuela cruda',
  imputado_de: '',
  ENERC_KCAL: '333',
  ENERC_KJ: '1394',
  WATER: '8.8',
  PROCNT: '13.3',
  FAT: '4.0',
  CHOCDF: '72.2',
  CHOAVL: '61.6',
  FIBTG: '10.6',
  ASH: '1.7',
  CA: '49',
  P: '407',
  ZN: '3.97',
  FE: '4.10',
  CARTBEQ: '',
  VITA: '0',
  THIA: '0.15',
  RIBF: '0.09',
  NIA: '1.00',
  VITC: '0.00',
  FOL: '',
  NA: '2',
  K: '211',
};

const parsed = (record: Record<string, string>): CatalogFood => {
  const result = parseTpcaRow(record);
  if (!result.ok) throw new Error(result.error.join(' · '));
  return result.value;
};
const value = (food: CatalogFood, code: string) =>
  food.nutrients.find((n) => n.nutrientCode === code);

describe('RN-I03 · una fila de la TPCA 2017', () => {
  it('el encabezado del CSV: código, grupo, nombre, imputado_de y los 22 nutrientes INFOODS en orden', () => {
    expect(TPCA_COLUMNS).toEqual(['codigo', 'grupo', 'nombre', 'imputado_de', ...TPCA_NUTRIENTS]);
    expect(TPCA_NUTRIENTS).toHaveLength(22);
  });

  it('da el alimento con su grupo, su estado y los 22 nutrientes por 100 g de parte comestible', () => {
    const food = parsed(A7);

    expect(food).toMatchObject({
      code: 'A7',
      groupCode: 'TPCA_A',
      name: 'Avena, hojuela cruda',
      state: 'RAW',
      tags: [],
    });
    expect(food.nutrients).toHaveLength(22);
    expect(value(food, 'FIBTG')).toEqual({ nutrientCode: 'FIBTG', valuePer100g: 10.6, flag: null });
  });

  it('una celda vacía es «sin dato» (null con MISSING), distinto de un cero publicado', () => {
    const food = parsed(A7);

    expect(value(food, 'FOL')).toEqual({
      nutrientCode: 'FOL',
      valuePer100g: null,
      flag: 'MISSING',
    });
    expect(value(food, 'VITC')).toEqual({ nutrientCode: 'VITC', valuePer100g: 0, flag: null });
  });

  it('«tr» son trazas: cero con la marca TRACE', () => {
    expect(value(parsed({ ...A7, NIA: 'tr' }), 'NIA')).toEqual({
      nutrientCode: 'NIA',
      valuePer100g: 0,
      flag: 'TRACE',
    });
  });

  it('un alimento imputado de otra tabla marca sus valores IMPUTED y lleva la tabla como etiqueta', () => {
    const food = parsed({ ...A7, imputado_de: 'Tabla INCAP 2012' });

    expect(food.tags).toEqual(['Imputado de Tabla INCAP 2012']);
    expect(value(food, 'PROCNT')?.flag).toBe('IMPUTED');
    expect(value(food, 'FOL')?.flag).toBe('MISSING');
  });

  it('el estado sale del nombre oficial (RN-E12)', () => {
    expect(parsed({ ...A7, codigo: 'A6', nombre: 'Avena, hojuela cocida' }).state).toBe('COOKED');
  });

  it('rechaza código, grupo, nombre e imputación que no son de la TPCA, cada error con su columna', () => {
    const result = parseTpcaRow({
      ...A7,
      codigo: 'B7',
      grupo: 'S',
      nombre: ' ',
      imputado_de: 'Tabla X',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual([
      'grupo: «S» no es un grupo de la TPCA 2017 que se cargue',
      'codigo: «B7» no corresponde al grupo «S»',
      'nombre: vacío',
      'imputado_de: «Tabla X» no es una tabla de la leyenda de la TPCA',
    ]);
  });

  it('rechaza valores que no son números, negativos o imposibles por 100 g', () => {
    const result = parseTpcaRow({ ...A7, ENERC_KCAL: '1200', FAT: '100.5', CA: '-3', K: '4,2' });

    expect(!result.ok && result.error).toEqual([
      'ENERC_KCAL: 1200 kcal supera lo posible en 100 g (900)',
      'FAT: 100.5 g supera lo posible en 100 g (100)',
      'CA: «-3» no es un valor (número con punto decimal, «tr» o vacío)',
      'K: «4,2» no es un valor (número con punto decimal, «tr» o vacío)',
    ]);
  });
});
