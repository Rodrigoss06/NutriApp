import { describe, expect, it } from 'vitest';
import { formatDate, todayIn } from './dates';

describe('RN-A02 · fechas en la zona de la organización', () => {
  it('una fecha de calendario no cambia de día al mostrarse', () => {
    expect(formatDate('2026-12-31')).toBe('31 de diciembre de 2026');
  });

  it('hoy depende de la zona: a las 02:00 UTC aún es el día anterior en Lima', () => {
    const instant = new Date('2027-01-08T02:00:00Z');
    expect(todayIn('America/Lima', instant)).toBe('2027-01-07');
    expect(todayIn('UTC', instant)).toBe('2027-01-08');
  });
});
