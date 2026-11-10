import { describe, expect, it } from 'vitest';
import {
  closesOn,
  openWeekDate,
  sundayOf,
  WEEKLY_CHECKIN_CLOSED,
  WEEKLY_CHECKIN_NOT_SUNDAY,
  weeklyCheckinProblem,
} from './weekly-checkin.js';

// Noviembre de 2026: el 15 es domingo.
describe('RN-G11 · P-21 · el check-in de la semana, del domingo al martes siguiente', () => {
  it('abre el domingo y sigue abierto el lunes y el martes; de miércoles a sábado no hay check-in', () => {
    expect(openWeekDate('2026-11-15')).toBe('2026-11-15');
    expect(openWeekDate('2026-11-16')).toBe('2026-11-15');
    expect(openWeekDate('2026-11-17')).toBe('2026-11-15');
    for (const day of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']) {
      expect(openWeekDate(day)).toBeNull();
    }
    expect(closesOn('2026-11-15')).toBe('2026-11-17');
  });

  it('solo el domingo abierto: otro día, o un domingo que ya cerró o que no llegó, da su código', () => {
    expect(weeklyCheckinProblem('2026-11-15', '2026-11-17')).toBeNull();
    expect(weeklyCheckinProblem('2026-11-16', '2026-11-16')).toBe(WEEKLY_CHECKIN_NOT_SUNDAY);
    expect(weeklyCheckinProblem('2026-11-15', '2026-11-18')).toBe(WEEKLY_CHECKIN_CLOSED);
    expect(weeklyCheckinProblem('2026-11-22', '2026-11-17')).toBe(WEEKLY_CHECKIN_CLOSED);
  });

  it('P-22 · el domingo de cada semana del macrociclo, empiece el día que empiece', () => {
    // Mateo empezó un martes (06/10): su semana 1 va del 06 al 12 y su domingo es el 11.
    expect(sundayOf('2026-10-06')).toBe('2026-10-11');
    expect(sundayOf('2026-11-09')).toBe('2026-11-15');
    expect(sundayOf('2026-11-15')).toBe('2026-11-15');
  });
});
