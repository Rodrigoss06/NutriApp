import { describe, expect, it } from 'vitest';
import { addDays, dayStartIn, formatDate, instantIn, localDateTimeIn, todayIn } from './dates';

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

describe('RN-C09 · la hora de la evaluación es la del consultorio', () => {
  it('la hora local de Lima a las 13:30 UTC es las 08:30', () => {
    expect(localDateTimeIn('America/Lima', new Date('2026-10-15T13:30:00Z'))).toBe(
      '2026-10-15T08:30',
    );
  });

  it('las 08:30 de Lima son las 13:30 UTC, sin importar la zona del navegador', () => {
    expect(instantIn('2026-10-15T08:30', 'America/Lima')).toBe('2026-10-15T13:30:00.000Z');
    expect(instantIn('2026-10-15T08:30', 'UTC')).toBe('2026-10-15T08:30:00.000Z');
  });

  it('ida y vuelta: la hora local de un instante vuelve al mismo instante', () => {
    const instant = new Date('2026-07-01T23:05:00Z');
    expect(instantIn(localDateTimeIn('Europe/Madrid', instant), 'Europe/Madrid')).toBe(
      instant.toISOString(),
    );
  });
});
