import { describe, expect, it } from 'vitest';
import {
  parseTaferaFactorRow,
  parseTaferaMeasureRow,
  TAFERA_FACTOR_COLUMNS,
  TAFERA_MEASURE_COLUMNS,
} from './tafera.js';

/** Fila 3-71 de seeds/food/tafera-2016-medidas.csv: manzana con cáscara, con peso bruto. */
const APPLE: Record<string, string> = {
  codigo: '3-71',
  codigo_tpca: 'C116',
  alimento: 'Manzana “delicia roja”',
  unidad: 'Unidad pequeña',
  medida: 'Unidad pequeña',
  peso_bruto_g: '105.7',
  peso_neto_g: '100.6',
  parte_comestible_pct: '95',
  energia_kcal: '52',
  datos_1985: 'no',
};

/** Fila II-131 de seeds/food/tafera-2016-factores.csv. */
const WING: Record<string, string> = {
  codigo: 'II-131',
  codigo_tpca: 'F78',
  alimento: 'Pollo, ala',
  coccion: 'Sancochado',
  factor: '1.18',
  datos_1985: 'no',
};

describe('RF-38 · RN-I04 · una medida casera de la TAFERA 2016', () => {
  it('el encabezado del CSV', () => {
    expect(TAFERA_MEASURE_COLUMNS).toEqual([
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
    ]);
  });

  it('RN-E12: da la medida del alimento de la TPCA con su peso neto (parte comestible) y su bruto', () => {
    expect(parseTaferaMeasureRow(APPLE)).toEqual({
      ok: true,
      value: {
        code: '3-71',
        foodCode: 'C116',
        name: 'Unidad pequeña',
        grams: 100.6,
        grossGrams: 105.7,
      },
    });
  });

  it('sin peso bruto ni % comestible (la fuente no los da): bruto null', () => {
    const result = parseTaferaMeasureRow({
      ...APPLE,
      peso_bruto_g: '',
      parte_comestible_pct: '',
    });

    expect(result.ok && result.value.grossGrams).toBeNull();
  });

  it('el bruto no puede ser menor que el neto', () => {
    expect(parseTaferaMeasureRow({ ...APPLE, peso_bruto_g: '90' })).toEqual({
      ok: false,
      error: ['peso_bruto_g: 90 es menor que el neto (100.6)'],
    });
  });

  it('cada error nombra su columna: código, alimento de la TPCA, pesos, % y marca de 1985', () => {
    const result = parseTaferaMeasureRow({
      ...APPLE,
      codigo: '13-1',
      codigo_tpca: 'c116',
      medida: ' ',
      peso_neto_g: '0',
      parte_comestible_pct: '101',
      energia_kcal: '52,0',
      datos_1985: 'sí',
    });

    expect(result).toEqual({
      ok: false,
      error: [
        'codigo: «13-1» no es un código de la TAFERA (grupo-posición)',
        'codigo_tpca: «c116» no es un código de la TPCA (grupo y número)',
        'medida: vacío',
        'peso_neto_g: «0» no es un número positivo con punto decimal',
        'parte_comestible_pct: «101» no es un porcentaje mayor que 0 y hasta 100',
        'energia_kcal: «52,0» no es un número con punto decimal',
        'datos_1985: «sí» no es «si» ni «no»',
      ],
    });
  });

  it('un peso que no cabe en la columna es una columna corrida, no un dato', () => {
    expect(parseTaferaMeasureRow({ ...APPLE, peso_neto_g: '1000000' })).toEqual({
      ok: false,
      error: ['peso_neto_g: 1000000 no cabe en la columna (999999.99)'],
    });
  });
});

describe('RF-38 · RN-I04 · un factor de conversión de peso cocido a crudo', () => {
  it('el encabezado del CSV', () => {
    expect(TAFERA_FACTOR_COLUMNS).toEqual([
      'codigo',
      'codigo_tpca',
      'alimento',
      'coccion',
      'factor',
      'datos_1985',
    ]);
  });

  it('da el factor del alimento crudo de la TPCA: peso crudo = peso cocido × factor', () => {
    expect(parseTaferaFactorRow(WING)).toEqual({
      ok: true,
      value: {
        code: 'II-131',
        foodCode: 'F78',
        name: 'Pollo, ala',
        method: 'Sancochado',
        cookedToRawFactor: 1.18,
      },
    });
  });

  it('el factor es positivo y el código es del módulo II', () => {
    expect(parseTaferaFactorRow({ ...WING, codigo: 'II-1', factor: '0', coccion: '' })).toEqual({
      ok: false,
      error: [
        'codigo: «II-1» no es un código del módulo II (II-001)',
        'coccion: vacío',
        'factor: «0» no es un número positivo con punto decimal',
      ],
    });
  });
});
