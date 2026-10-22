import { describe, expect, it } from 'vitest';
import { formatFactor, formatMeasureGrams, formatPer100g, formatTotal } from './format';

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

  it('las medidas y los factores de la TAFERA, con sus decimales', () => {
    expect(formatMeasureGrams(203.8)).toBe('203.8 g');
    expect(formatFactor(0.51)).toBe('0.51');
  });
});
