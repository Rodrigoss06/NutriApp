import { describe, expect, it } from 'vitest';
import { averageAdequacy, dayAdequacy } from './adequacy.js';

const RANGE = [90, 110] as const;

describe('RN-E10 · la adecuación del día con el motor (ADEQUACY)', () => {
  const rule = dayAdequacy(RANGE);

  it('lo consumido sobre la meta, en rango con el rango de la organización', () => {
    expect(rule({ known: 1835, missing: 0 }, 1835)).toEqual({ pct: 100, inRange: true });
    expect(rule({ known: 1600, missing: 0 }, 1835).inRange).toBe(false);
    expect(dayAdequacy([80, 120])({ known: 1600, missing: 0 }, 1835).inRange).toBe(true);
  });

  it('con un dato faltante, en rango queda sin saber salvo que lo conocido ya pase el máximo', () => {
    expect(rule({ known: 1700, missing: 1 }, 1835).inRange).toBeNull();
    expect(rule({ known: 2100, missing: 1 }, 1835).inRange).toBe(false);
  });

  it('sin meta o sin registros, sin adecuación', () => {
    expect(rule({ known: 1800, missing: 0 }, null)).toEqual({ pct: null, inRange: null });
    expect(rule({ known: null, missing: 0 }, 1835)).toEqual({ pct: null, inRange: null });
    expect(rule({ known: 1800, missing: 0 }, 0)).toEqual({ pct: null, inRange: null });
  });
});

describe('G-20 · RN-G09 · la adecuación del promedio de la semana', () => {
  it('la semana de Luis contra 1834.54 kcal: 104.1 %', () => {
    const pct = averageAdequacy(RANGE)([1790, 1950, 1600, 2100, 1830, 2400, 1700], 1834.54);

    expect(pct).toBeCloseTo(104.1, 1);
  });
});
