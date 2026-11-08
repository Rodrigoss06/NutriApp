import type { DietAnalytics, DietDay, DietWeek } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  dietChartPoints,
  kcalIsMinimum,
  slotsInDayOrder,
  summaryWeek,
  weekLabel,
} from './diet-view';

const missing = { items: 0, kcal: 0, choG: 0, proteinG: 0, fatG: 0, fiberG: 0 };

const day = (localDate: string, changes: Partial<DietDay> = {}): DietDay => ({
  localDate,
  dayKind: null,
  dayProfile: null,
  kcal: null,
  choG: null,
  proteinG: null,
  fatG: null,
  fiberG: null,
  targetKcal: 1835,
  targetChoG: null,
  targetProteinG: null,
  targetFatG: null,
  adequacyKcalPct: null,
  adequacyChoPct: null,
  adequacyProteinPct: null,
  adequacyFatPct: null,
  kcalInRange: null,
  mealsLogged: 0,
  mealsPlanned: 5,
  offPlanItems: 0,
  waterMl: null,
  waterTargetMl: null,
  nutrientsMissing: missing,
  ...changes,
});

const nutrient = { consumed: null, target: null, adequacyPct: null, complete: true };
const week = (weekStart: string, weekEnd: string, daysLogged: number): DietWeek => ({
  weekStart,
  weekEnd,
  daysWithTarget: 7,
  daysLogged,
  daysInRange: 0,
  kcal: nutrient,
  choG: nutrient,
  proteinG: nutrient,
  fatG: nutrient,
});

describe('RF-32 · la analítica de dieta en pantalla', () => {
  it('cada día del rango en el gráfico; sin registros, vacío y no 0 (RN-G09)', () => {
    const analytics: DietAnalytics = {
      from: '2026-11-02',
      to: '2026-11-04',
      adequacyRangePct: [90, 110],
      method: { code: 'ADEQUACY', version: '1.0.0' },
      days: [
        day('2026-11-02', { kcal: 1790, nutrientsMissing: { ...missing, items: 4 } }),
        day('2026-11-03'),
      ],
      weeks: [],
      mealSlots: [],
    };

    expect(
      dietChartPoints(analytics).map(({ date, target, actual }) => [date, target, actual]),
    ).toEqual([
      ['2026-11-02', 1835, 1790],
      ['2026-11-03', 1835, null],
      ['2026-11-04', null, null],
    ]);
  });

  it('RN-I03: si a un registro le falta la energía, lo consumido es un mínimo', () => {
    expect(kcalIsMinimum(day('2026-11-02', { nutrientsMissing: { ...missing, kcal: 1 } }))).toBe(
      true,
    );
    expect(kcalIsMinimum(day('2026-11-02'))).toBe(false);
  });

  it('las tarjetas resumen la semana más reciente con registros', () => {
    const weeks = [
      week('2026-10-26', '2026-11-01', 5),
      week('2026-11-02', '2026-11-08', 3),
      week('2026-11-09', '2026-11-15', 0),
    ];
    expect(summaryWeek(weeks)?.weekStart).toBe('2026-11-02');
    expect(summaryWeek([week('2026-11-09', '2026-11-15', 0)])?.weekStart).toBe('2026-11-09');
    expect(summaryWeek([])).toBeNull();
  });

  it('los tiempos de comida en el orden del día', () => {
    const slot = (slotCode: string) => ({
      slotCode,
      plannedDays: 1,
      loggedDays: 1,
      adherencePct: 100,
      offPlanDays: 0,
    });
    expect(
      slotsInDayOrder([slot('DINNER'), slot('BREAKFAST'), slot('LUNCH')]).map((s) => s.slotCode),
    ).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);
  });

  it('la semana como etiqueta corta, también si cruza de mes', () => {
    expect(weekLabel('2026-11-02', '2026-11-08')).toBe('2–8 nov.');
    expect(weekLabel('2026-10-26', '2026-11-01')).toBe('26 oct.–1 nov.');
  });
});
