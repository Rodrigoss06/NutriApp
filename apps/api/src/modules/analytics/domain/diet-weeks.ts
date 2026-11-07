import type { DailySummary, MealSlotDay } from './daily-summary.js';

/**
 * La analítica de dieta de un rango (RF-32, RN-G09): semanas de lunes a domingo con su promedio, su adecuación y sus días en rango,
 * y la adherencia por tiempo de comida. Puro: la adecuación del promedio la calcula el motor y llega como regla.
 */

const DAY_MS = 86_400_000;

/** RN-G09 · el rango de la analítica: hasta 53 semanas (el contrato repite el número para la web). */
export const ANALYTICS_MAX_DAYS = 371;
/** Sin rango, las últimas 4 semanas hasta hoy, en la fecha local del paciente (RN-G04). */
export const ANALYTICS_DEFAULT_DAYS = 28;

/** Un día del calendario más o menos n días, sin zona horaria: es una fecha local (RN-G04). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Los días de un rango, contando los dos extremos. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** El lunes de la semana de ese día. */
export function weekStartOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** El promedio consumido sobre la meta promedio × 100 (RN-E10); null si no se puede calcular. */
export type AverageAdequacy = (
  consumedDaily: readonly number[],
  prescribed: number,
) => number | null;

export type WeekNutrient = 'kcal' | 'choG' | 'proteinG' | 'fatG';
const WEEK_NUTRIENTS: readonly WeekNutrient[] = ['kcal', 'choG', 'proteinG', 'fatG'];
const TARGET_OF: Readonly<
  Record<WeekNutrient, 'targetKcal' | 'targetChoG' | 'targetProteinG' | 'targetFatG'>
> = { kcal: 'targetKcal', choG: 'targetChoG', proteinG: 'targetProteinG', fatG: 'targetFatG' };

export interface WeekNutrientSummary {
  readonly consumed: number | null;
  readonly target: number | null;
  readonly adequacyPct: number | null;
  /** false si en algún día con registros faltó el dato: lo consumido es «al menos» (RN-I03). */
  readonly complete: boolean;
}

export interface DietWeek {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly daysWithTarget: number;
  readonly daysLogged: number;
  readonly daysInRange: number;
  readonly kcal: WeekNutrientSummary;
  readonly choG: WeekNutrientSummary;
  readonly proteinG: WeekNutrientSummary;
  readonly fatG: WeekNutrientSummary;
}

export interface MealSlotAdherence {
  readonly slotCode: string;
  readonly plannedDays: number;
  readonly loggedDays: number;
  readonly adherencePct: number | null;
  readonly offPlanDays: number;
}

type DietRow = Pick<
  DailySummary,
  | 'localDate'
  | 'kcal'
  | 'choG'
  | 'proteinG'
  | 'fatG'
  | 'targetKcal'
  | 'targetChoG'
  | 'targetProteinG'
  | 'targetFatG'
  | 'kcalInRange'
  | 'mealSlots'
  | 'nutrientsMissing'
>;

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

/** Un nutriente en la semana: los días con registros y con meta de ese nutriente entran en el promedio. */
function weekNutrient(
  rows: readonly DietRow[],
  key: WeekNutrient,
  adequacy: AverageAdequacy,
): WeekNutrientSummary {
  const counted = rows.flatMap((row) => {
    const consumed = row[key];
    const target = row[TARGET_OF[key]];
    return row.nutrientsMissing.items > 0 && consumed !== null && target !== null && target > 0
      ? [{ consumed, target, complete: row.nutrientsMissing[key] === 0 }]
      : [];
  });
  if (counted.length === 0) {
    return { consumed: null, target: null, adequacyPct: null, complete: true };
  }
  const target = mean(counted.map((day) => day.target));
  return {
    consumed: mean(counted.map((day) => day.consumed)),
    target,
    adequacyPct: adequacy(
      counted.map((day) => day.consumed),
      target,
    ),
    complete: counted.every((day) => day.complete),
  };
}

/** Las semanas de lunes a domingo que tienen algún día en el resumen, en orden (RN-G09). */
export function dietWeeks(rows: readonly DietRow[], adequacy: AverageAdequacy): DietWeek[] {
  const byWeek = new Map<string, DietRow[]>();
  for (const row of rows) {
    const start = weekStartOf(row.localDate);
    byWeek.set(start, [...(byWeek.get(start) ?? []), row]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, days]) => ({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      daysWithTarget: days.filter((day) => day.targetKcal !== null).length,
      daysLogged: days.filter((day) => day.nutrientsMissing.items > 0).length,
      daysInRange: days.filter((day) => day.kcalInRange === true).length,
      ...(Object.fromEntries(
        WEEK_NUTRIENTS.map((key) => [key, weekNutrient(days, key, adequacy)]),
      ) as Record<WeekNutrient, WeekNutrientSummary>),
    }));
}

/** Por tiempo de comida (RF-32): en cuántos de los días en que el plan lo tenía hubo registro, y los días fuera del plan. */
export function mealSlotAdherence(rows: readonly DietRow[]): MealSlotAdherence[] {
  const slots = new Map<string, { planned: number; logged: number; offPlan: number }>();
  for (const row of rows) {
    for (const [code, slot] of Object.entries<MealSlotDay>(row.mealSlots)) {
      const current = slots.get(code) ?? { planned: 0, logged: 0, offPlan: 0 };
      if (slot.planned) {
        current.planned += 1;
        if (slot.logged > 0) current.logged += 1;
      } else if (slot.logged > 0) {
        current.offPlan += 1;
      }
      slots.set(code, current);
    }
  }
  return [...slots.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slotCode, { planned, logged, offPlan }]) => ({
      slotCode,
      plannedDays: planned,
      loggedDays: logged,
      adherencePct: planned === 0 ? null : (logged * 100) / planned,
      offPlanDays: offPlan,
    }));
}

/** RN-G09 · la tendencia por mes: hasta 24 meses calendario (el contrato repite el número para la web). */
export const TREND_MAX_MONTHS = 24;
/** Sin rango, el mes actual y los 11 anteriores, en la fecha local del paciente (RN-G04). */
export const TREND_DEFAULT_MONTHS = 12;

const monthIndex = (date: string): number => {
  const [year = 0, month = 1] = date.split('-').map(Number);
  return year * 12 + month - 1;
};

/** El primer día del mes de esa fecha, `monthsBack` meses antes. */
export function monthStartOf(date: string, monthsBack = 0): string {
  const index = monthIndex(date) - monthsBack;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** Los meses calendario que toca un rango, contando los dos extremos. */
export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from) + 1;
}

type TrendRow = DietRow & Pick<DailySummary, 'workoutsDone' | 'workoutsPlanned'>;

/** Un mes calendario de la tendencia (RN-G09). */
export interface TrendMonth {
  /** YYYY-MM, en la fecha local del paciente. */
  readonly month: string;
  readonly daysWithTarget: number;
  readonly daysLogged: number;
  readonly daysInRange: number;
  /** La energía: el promedio de los días con registros y meta, contra la meta promedio (RN-E10). */
  readonly kcal: WeekNutrientSummary;
  readonly sessionsDone: number;
  /** Las programadas en los días con meta de entrenamiento; null si ningún día del mes la tuvo. */
  readonly sessionsPlanned: number | null;
}

/**
 * RN-G09 · la tercera agregación: por mes calendario, para leer la tendencia frente a la evolución antropométrica (ADR-091).
 * La adecuación es la del promedio del mes, como la de la semana; las sesiones, las registradas contra las programadas.
 */
export function trendMonths(rows: readonly TrendRow[], adequacy: AverageAdequacy): TrendMonth[] {
  const byMonth = new Map<string, TrendRow[]>();
  for (const row of rows) {
    const month = row.localDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, days]) => {
      const planned = days.filter((day) => day.workoutsPlanned !== null);
      return {
        month,
        daysWithTarget: days.filter((day) => day.targetKcal !== null).length,
        daysLogged: days.filter((day) => day.nutrientsMissing.items > 0).length,
        daysInRange: days.filter((day) => day.kcalInRange === true).length,
        kcal: weekNutrient(days, 'kcal', adequacy),
        sessionsDone: days.reduce((total, day) => total + day.workoutsDone, 0),
        sessionsPlanned:
          planned.length === 0
            ? null
            : planned.reduce((total, day) => total + (day.workoutsPlanned ?? 0), 0),
      };
    });
}
