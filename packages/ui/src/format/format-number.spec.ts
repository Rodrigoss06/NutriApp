import { describe, expect, it } from 'vitest';
import { formatNumber, parseDecimal } from './format-number';

describe('RN-D09 · se redondea solo al presentar', () => {
  it.each([
    [16.2104, 'mass', '16.2'],
    [20.2563, 'percent', '20.3'],
    [12.25, 'length', '12.3'],
    [1.052613, 'density', '1.05261'],
    [52.0, 'index', '52.0'],
    [-0.6914, 'zScore', '-0.69'],
    [1834.536, 'kcal', '1,835'],
    [183.7, 'grams', '184'],
    [6, 'exchanges', '6'],
  ] as const)('%s como %s se muestra %s (es-PE)', (value, kind, expected) => {
    expect(formatNumber(value, kind)).toBe(expected);
  });

  it('sin valor muestra una raya, nunca 0 ni NaN', () => {
    expect(formatNumber(null, 'mass')).toBe('—');
    expect(formatNumber(undefined, 'kcal')).toBe('—');
    expect(formatNumber(Number.NaN, 'kcal')).toBe('—');
  });
});

describe('NumberField · acepta coma o punto como decimal', () => {
  it.each([
    ['12,4', 12.4],
    ['12.4', 12.4],
    [' 80 ', 80],
    ['0,5', 0.5],
    ['.5', 0.5],
    ['12,', 12],
  ])('«%s» es %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '1,2,3', '12 kg', '1e3'])('«%s» no es una medida', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});
