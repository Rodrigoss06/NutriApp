import { shiftDate } from '@/features/patient-records/adjustments';

/**
 * Los rangos de la analítica de dieta, en semanas de lunes a domingo (RN-G09): la actual y las anteriores, completas. 52
 * semanas son 364 días como máximo, dentro de los 371 que acepta la API.
 */
export const RANGE_WEEKS = [4, 12, 26, 52] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];
export const DEFAULT_RANGE_WEEKS: RangeWeeks = 4;

/** El rango pedido en la dirección (`?semanas=12`); cualquier otro valor, el de 4 semanas. */
export function rangeWeeksOf(param: string | string[] | undefined): RangeWeeks {
  const value = typeof param === 'string' ? Number(param) : Number.NaN;
  return RANGE_WEEKS.find((weeks) => weeks === value) ?? DEFAULT_RANGE_WEEKS;
}

/** El lunes de la semana de una fecha local (RN-G04, RN-G09). */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

/** Desde el lunes de hace n − 1 semanas hasta hoy, en la fecha local del paciente. */
export function dietRange(weeks: RangeWeeks, today: string): { from: string; to: string } {
  return { from: shiftDate(mondayOf(today), -7 * (weeks - 1)), to: today };
}

/** Todos los días del rango: el gráfico deja vacío el día sin registro, en vez de juntar días separados. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}
