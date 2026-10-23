import { describe, expect, it } from 'vitest';
import {
  formatFactor,
  formatMeasureGrams,
  formatPer100g,
  formatServings,
  formatTotal,
  formatTotalWithGaps,
} from './format';

describe('RN-I03 · RN-D09 · valores del catálogo de alimentos', () => {
  it('«sin dato» no es cero', () => {
    expect(formatPer100g(null, 'FIBTG', 'g')).toBe('sin dato');
    expect(formatPer100g(0, 'FIBTG', 'g')).toBe('0.0 g');
    expect(formatTotal(null, 'FIBTG', 'g')).toBe('sin dato');
  });

  it('por 100 g, con los decimales con que la TPCA publica cada nutriente', () => {
    expect(formatPer100g(115, 'ENERC_KCAL', 'kcal')).toBe('115 kcal');
    expect(formatPer100g(2.4, 'PROCNT', 'g')).toBe('2.4 g');
    expect(formatPer100g(0.3, 'FE', 'mg')).toBe('0.30 mg');
    expect(formatPer100g(1469, 'ENERC_KJ', 'kJ')).toBe('1,469 kJ');
  });

  it('un total calculado: kcal y gramos enteros (RN-D09); mg con los decimales de su fuente', () => {
    expect(formatTotal(172.5, 'ENERC_KCAL', 'kcal')).toBe('173 kcal');
    expect(formatTotal(3.6, 'PROCNT', 'g')).toBe('4 g');
    expect(formatTotal(0.451, 'FE', 'mg')).toBe('0.45 mg');
  });

  it('las porciones de una receta, como se escribieron', () => {
    expect(formatServings(1)).toBe('1 porción');
    expect(formatServings(2)).toBe('2 porciones');
    expect(formatServings(2.5)).toBe('2.5 porciones');
  });

  it('las medidas y los factores de la TAFERA, con sus decimales', () => {
    expect(formatMeasureGrams(203.8)).toBe('203.8 g');
    expect(formatFactor(0.51)).toBe('0.51');
  });
});

describe('RN-I03 · ADR-061 · un total al que le faltan datos', () => {
  it('completo: el total, sin aviso', () => {
    expect(
      formatTotalWithGaps({ value: 204.25, known: 204.25, missing: 0 }, 2, 'ENERC_KCAL', 'kcal'),
    ).toEqual({ text: '204 kcal', gap: null });
  });

  it('si falta en algunos: «al menos» lo conocido y en cuántos falta', () => {
    expect(formatTotalWithGaps({ value: null, known: 18, missing: 1 }, 2, 'NA', 'mg')).toEqual({
      text: 'al menos 18 mg',
      gap: 'falta en 1 de 2',
    });
  });

  it('si lo conocido suma 0, el 0 sin «al menos»: un nutriente no baja de 0', () => {
    expect(formatTotalWithGaps({ value: null, known: 0, missing: 1 }, 2, 'FIBTG', 'g')).toEqual({
      text: '0 g',
      gap: 'falta en 1 de 2',
    });
    expect(formatTotalWithGaps({ value: null, known: 0.3, missing: 1 }, 2, 'FIBTG', 'g')).toEqual({
      text: '0 g',
      gap: 'falta en 1 de 2',
    });
  });

  it('si falta en todos: «sin dato»', () => {
    expect(formatTotalWithGaps({ value: null, known: 0, missing: 2 }, 2, 'FOL', 'µg')).toEqual({
      text: 'sin dato',
      gap: null,
    });
  });
});
