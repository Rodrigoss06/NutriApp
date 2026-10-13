import { describe, expect, it } from 'vitest';
import { addDays, dayStartIn, formatDate, todayIn } from './dates';

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

describe('RF-06 · rangos de fechas en la zona de la organización', () => {
  it('el día empieza a la medianoche local: en Lima, a las 05:00 UTC', () => {
    expect(dayStartIn('2026-10-12', 'America/Lima').toISOString()).toBe('2026-10-12T05:00:00.000Z');
    expect(dayStartIn('2026-10-12', 'UTC').toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(dayStartIn('2026-10-12', 'Asia/Tokyo').toISOString()).toBe('2026-10-11T15:00:00.000Z');
  });

  it('sumar días cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -90)).toBe('2025-12-01');
  });
});
