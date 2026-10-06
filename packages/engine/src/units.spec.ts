import { describe, expect, it } from 'vitest';
import { cm, cmToM, kcal, kg, m, mm, mmToCm, type Cm, type Kg, type M } from './units.js';

describe('RN-D09 · unidades con marca de tipo y sin redondeo interno', () => {
  it('conservan el valor exacto', () => {
    expect([kg(70.123456789), cm(175.05), m(1.75), mm(12.3), kcal(-500.5)]).toEqual([
      70.123456789, 175.05, 1.75, 12.3, -500.5,
    ]);
  });

  it.each([kg, cm, m, mm, kcal])('rechazan valores que no son finitos', (make) => {
    expect(() => make(Number.NaN)).toThrow(RangeError);
    expect(() => make(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('convierten centímetros a metros y milímetros a centímetros, como pide Rocha', () => {
    expect(cmToM(cm(175))).toBe(1.75);
    expect(mmToCm(mm(12))).toBe(1.2);
  });

  it('la marca impide mezclar unidades', () => {
    const heightCm = cm(175);
    // @ts-expect-error centímetros no son metros: la trampa de unidades de Rocha
    const heightM: M = heightCm;
    // @ts-expect-error un número sin unidad no es Kg
    const weightKg: Kg = 80;
    const sameCm: Cm = heightCm;

    expect([heightM, weightKg, sameCm]).toEqual([175, 80, 175]);
  });
});
