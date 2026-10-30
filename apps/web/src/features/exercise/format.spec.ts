import { describe, expect, it } from 'vitest';
import { baseRest, baseVolume } from './format';

const BASE = {
  baseSets: 3,
  baseRepsMin: 10,
  baseRepsMax: 10,
  baseMeasure: 'REPS',
  baseRestSeconds: 90,
} as const;

describe('RF-25 · los valores base de un ejercicio', () => {
  it('series por repeticiones, con un rango si lo tiene', () => {
    expect(baseVolume(BASE)).toBe('3 × 10 repeticiones');
    expect(baseVolume({ ...BASE, baseRepsMin: 8, baseRepsMax: 12 })).toBe(
      '3 × 8 a 12 repeticiones',
    );
    expect(baseVolume({ ...BASE, baseRepsMax: null })).toBe('3 × 10 repeticiones');
  });

  it('una plancha en segundos y una caminata en minutos', () => {
    expect(baseVolume({ ...BASE, baseRepsMin: 30, baseRepsMax: 30, baseMeasure: 'SECONDS' })).toBe(
      '3 × 30 segundos',
    );
    expect(
      baseVolume({
        ...BASE,
        baseSets: 1,
        baseRepsMin: 20,
        baseRepsMax: 20,
        baseMeasure: 'MINUTES',
      }),
    ).toBe('1 × 20 minutos');
  });

  it('sin valores base no dice nada', () => {
    expect(baseVolume({ ...BASE, baseSets: null })).toBeNull();
    expect(baseVolume({ ...BASE, baseRepsMin: null })).toBeNull();
  });

  it('el descanso: sin descanso no se menciona', () => {
    expect(baseRest(BASE)).toBe('90 s de descanso');
    expect(baseRest({ ...BASE, baseRestSeconds: 0 })).toBeNull();
    expect(baseRest({ ...BASE, baseRestSeconds: null })).toBeNull();
  });
});
