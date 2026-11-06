import { describe, expect, it } from 'vitest';
import { datesBetween, dietRange, mondayOf, rangeWeeksOf } from './range';

describe('RN-G09 · el rango de la analítica de dieta, en semanas de lunes a domingo', () => {
  it('el lunes de la semana de cada día; el domingo cierra la semana', () => {
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(mondayOf('2026-11-06')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });

  it('4 semanas: la actual y las 3 anteriores, completas desde el lunes, hasta hoy', () => {
    expect(dietRange(4, '2026-11-06')).toEqual({ from: '2026-10-12', to: '2026-11-06' });
  });

  it('52 semanas caben en los 371 días que acepta la API', () => {
    const { from, to } = dietRange(52, '2026-11-08');
    expect(datesBetween(from, to)).toHaveLength(364);
  });

  it('solo los rangos ofrecidos; cualquier otro valor, 4 semanas', () => {
    expect(rangeWeeksOf('12')).toBe(12);
    expect(rangeWeeksOf('5')).toBe(4);
    expect(rangeWeeksOf(['12', '26'])).toBe(4);
    expect(rangeWeeksOf(undefined)).toBe(4);
  });

  it('todos los días del rango, contando los dos extremos', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});
