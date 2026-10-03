import { describe, expect, it } from 'vitest';
import { cm, kcal, kg, ml, mm, type Cm, type Kg, type Mm } from './units.js';

const units = { kg, cm, mm, kcal, ml };

describe('RN-D09 · unidades con marca de tipo y sin redondeo interno', () => {
  it.each([
    ['kg', 70.123456789],
    ['cm', 175.05],
    ['mm', 12.333333333333334],
    ['kcal', -500.5],
    ['ml', 2500],
  ] as const)('%s conserva el valor exacto: se redondea solo al presentar', (unit, value) => {
    expect(units[unit](value)).toBe(value);
  });

  it.each(Object.entries(units))('%s rechaza valores que no son finitos', (_unit, make) => {
    expect(() => make(Number.NaN)).toThrow(RangeError);
    expect(() => make(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => make(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('la marca impide mezclar unidades o usar números sin unidad', () => {
    const heightCm: Cm = cm(175);
    // @ts-expect-error centímetros no son milímetros
    const tricepsMm: Mm = heightCm;
    // @ts-expect-error un número sin unidad no es Kg
    const weightKg: Kg = 70;

    expect([tricepsMm, weightKg]).toEqual([175, 70]);
  });
});
