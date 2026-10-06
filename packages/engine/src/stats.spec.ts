import { describe, expect, it } from 'vitest';
import { mean, median, sum } from './stats.js';

describe('RN-C03 · estadísticas sin redondeo', () => {
  it('suma, media y mediana', () => {
    expect(sum([12, 12.4])).toBeCloseTo(24.4, 12);
    expect(mean([12, 12.4])).toBeCloseTo(12.2, 12);
    expect(median([13, 12, 12.6])).toBe(12.6);
  });

  it('la mediana de un número par de valores es la media de los dos centrales', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
