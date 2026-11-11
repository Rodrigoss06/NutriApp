import { domainError } from '@nutricoach/shared-kernel';
import { addDays } from './day-changes.js';

/**
 * El check-in de la semana (P14.5, PR 5; P-21 y P-22, respuestas de Jeremy; ADR-109): el domingo, el paciente declara su
 * alimentación de la semana (0 a 100 %), su peso y un comentario. Se completa del domingo al martes siguiente, para que una semana
 * no quede vacía si descansa el domingo. Puro.
 */

/** El domingo, el lunes y el martes. */
export const WEEKLY_CHECKIN_OPEN_DAYS = 3;

const isoWeekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

export const isSunday = (date: string): boolean => isoWeekday(date) === 7;

/** El domingo cuyo check-in está abierto hoy, en la fecha local del paciente (RN-G04); null de miércoles a sábado. */
export function openWeekDate(today: string): string | null {
  const sinceSunday = isoWeekday(today) % 7;
  return sinceSunday < WEEKLY_CHECKIN_OPEN_DAYS ? addDays(today, -sinceSunday) : null;
}

/** El último día para completar el check-in de ese domingo: el martes siguiente. */
export const closesOn = (weekDate: string): string =>
  addDays(weekDate, WEEKLY_CHECKIN_OPEN_DAYS - 1);

export const WEEKLY_CHECKIN_NOT_SUNDAY = domainError({
  code: 'NC-TRK-019',
  rule: 'RN-G11',
  message: 'El check-in de la semana es de un domingo.',
});

export const WEEKLY_CHECKIN_CLOSED = domainError({
  code: 'NC-TRK-020',
  rule: 'RN-G11',
  message:
    'El check-in de esa semana no está abierto: se completa del domingo al martes siguiente.',
});

/** Lo que impide enviar el check-in de ese domingo hoy; null si se puede. */
export function weeklyCheckinProblem(weekDate: string, today: string) {
  if (!isSunday(weekDate)) return WEEKLY_CHECKIN_NOT_SUNDAY;
  return openWeekDate(today) === weekDate ? null : WEEKLY_CHECKIN_CLOSED;
}

/**
 * El domingo de una semana del macrociclo: la que empieza cualquier día tiene un solo domingo en sus 7 días. El control de esa
 * semana usa la alimentación de ese check-in (P-22).
 */
export function sundayOf(weekStart: string): string {
  return addDays(weekStart, (7 - isoWeekday(weekStart)) % 7);
}
