import {
  MEAL_SLOTS,
  type DietAnalytics,
  type DietDay,
  type DietWeek,
  type MealSlotAdherence,
} from '@nutricoach/contracts';
import { datesBetween } from './range';

const DAY = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_ONLY = new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: 'UTC' });
const at = (date: string) => new Date(`${date}T12:00:00Z`);

/** Un día como etiqueta corta: «2 nov.». */
export const shortDate = (date: string): string => DAY.format(at(date));

/** Una semana de lunes a domingo: «2–8 nov.», o «26 oct.–1 nov.» si cruza de mes. */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
  return `${sameMonth ? DAY_ONLY.format(at(weekStart)) : shortDate(weekStart)}–${shortDate(weekEnd)}`;
}

/** Si el día tiene registros de comida (RN-G09): sin registros, lo consumido es «sin dato», no 0. */
export const hasLogs = (day: DietDay): boolean => day.nutrientsMissing.items > 0;

/**
 * RN-I03: lo consumido es la suma de lo conocido. Si a algún registro le falta el dato, es un mínimo y se muestra
 * «al menos».
 */
export const kcalIsMinimum = (day: DietDay): boolean => day.nutrientsMissing.kcal > 0;

/** La semana que resumen las tarjetas: la más reciente con registros; si ninguna tiene, la más reciente. */
export function summaryWeek(weeks: readonly DietWeek[]): DietWeek | null {
  return weeks.findLast((week) => week.daysLogged > 0) ?? weeks.at(-1) ?? null;
}

/** Los tiempos de comida en el orden del día (la API los entrega por código). */
export function slotsInDayOrder(slots: readonly MealSlotAdherence[]): MealSlotAdherence[] {
  const order = (code: string) => {
    const index = (MEAL_SLOTS as readonly string[]).indexOf(code);
    return index === -1 ? MEAL_SLOTS.length : index;
  };
  return [...slots].sort((a, b) => order(a.slotCode) - order(b.slotCode));
}

export interface DietChartPoint {
  readonly date: string;
  readonly label: string;
  readonly target: number | null;
  readonly actual: number | null;
}

/** Cada día del rango con su meta y lo consumido: un día sin registros queda vacío y corta la línea. */
export function dietChartPoints(analytics: DietAnalytics): DietChartPoint[] {
  const byDate = new Map(analytics.days.map((day) => [day.localDate, day]));
  return datesBetween(analytics.from, analytics.to).map((date) => {
    const day = byDate.get(date);
    return {
      date,
      label: shortDate(date),
      target: day?.targetKcal ?? null,
      actual: day && hasLogs(day) ? day.kcal : null,
    };
  });
}
