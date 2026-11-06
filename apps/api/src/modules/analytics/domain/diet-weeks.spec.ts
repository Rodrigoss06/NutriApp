import {
  ANALYTICS_DEFAULT_DAYS as CONTRACT_DEFAULT_DAYS,
  ANALYTICS_MAX_DAYS as CONTRACT_MAX_DAYS,
} from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import type { DailySummary } from './daily-summary.js';
import {
  addDays,
  ANALYTICS_DEFAULT_DAYS,
  ANALYTICS_MAX_DAYS,
  daysBetween,
  dietWeeks,
  mealSlotAdherence,
  weekStartOf,
  type AverageAdequacy,
} from './diet-weeks.js';

type Row = Parameters<typeof dietWeeks>[0][number];

const row = (localDate: string, kcal: number | null, values: Partial<Row> = {}): Row => ({
  localDate,
  kcal,
  choG: kcal === null ? null : 200,
  proteinG: kcal === null ? null : 150,
  fatG: kcal === null ? null : 50,
  targetKcal: 1834.5,
  targetChoG: 184,
  targetProteinG: 160,
  targetFatG: 51,
  kcalInRange: null,
  mealSlots: {},
  nutrientsMissing: {
    items: kcal === null ? 0 : 3,
    kcal: 0,
    choG: 0,
    proteinG: 0,
    fatG: 0,
    fiberG: 0,
  },
  ...values,
});

const average: AverageAdequacy = (consumed, prescribed) =>
  ((consumed.reduce((a, b) => a + b, 0) / consumed.length) * 100) / prescribed;

describe('RN-G09 · el rango de la analítica', () => {
  it('es el mismo que publica el contrato para la web', () => {
    expect([ANALYTICS_MAX_DAYS, ANALYTICS_DEFAULT_DAYS]).toEqual([
      CONTRACT_MAX_DAYS,
      CONTRACT_DEFAULT_DAYS,
    ]);
  });
});

describe('RN-G04 · fechas locales', () => {
  it('suma días, cuenta un rango y da el lunes de la semana', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-28')).toBe(28);
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02');
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02');
  });
});

describe('RN-G09 · la semana de lunes a domingo', () => {
  it('G-20 · promedio, adecuación y días en rango de la semana de Luis', () => {
    const kcal = [1790, 1950, 1600, 2100, 1830, 2400, 1700];
    const inRange = [true, true, false, false, true, false, true];
    const rows = kcal.map((value, i) =>
      row(addDays('2026-11-02', i), value, { kcalInRange: inRange[i] ?? null }),
    );

    const [week] = dietWeeks(rows, average);

    expect(week?.weekStart).toBe('2026-11-02');
    expect(week?.weekEnd).toBe('2026-11-08');
    expect(week?.kcal.consumed).toBe(1910);
    expect(week?.kcal.adequacyPct).toBeCloseTo(104.1, 1);
    expect(week?.daysInRange).toBe(4);
    expect([week?.daysWithTarget, week?.daysLogged]).toEqual([7, 7]);
  });

  it('un día con meta y sin registros cuenta en los días con meta, no en el promedio', () => {
    const [week] = dietWeeks([row('2026-11-02', 1800), row('2026-11-03', null)], average);

    expect([week?.daysWithTarget, week?.daysLogged]).toEqual([2, 1]);
    expect(week?.kcal.consumed).toBe(1800);
  });

  it('si en un día faltó el dato, lo de la semana es «al menos» (RN-I03)', () => {
    const [week] = dietWeeks(
      [
        row('2026-11-02', 1800),
        row('2026-11-03', 1700, {
          nutrientsMissing: { items: 3, kcal: 1, choG: 0, proteinG: 0, fatG: 0, fiberG: 0 },
        }),
      ],
      average,
    );

    expect(week?.kcal.complete).toBe(false);
    expect(week?.choG.complete).toBe(true);
  });

  it('separa las semanas y las ordena', () => {
    const weeks = dietWeeks([row('2026-11-10', 1800), row('2026-11-01', 1700)], average);

    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-10-26', '2026-11-09']);
  });
});

describe('RF-32 · adherencia por tiempo de comida', () => {
  it('días con registro sobre los días en que el plan lo tenía; fuera del plan aparte', () => {
    const slots = (breakfast: number, snack: number): DailySummary['mealSlots'] => ({
      BREAKFAST: { planned: true, logged: breakfast },
      LUNCH: { planned: true, logged: 0 },
      ...(snack > 0 ? { SNACK: { planned: false, logged: snack } } : {}),
    });

    expect(
      mealSlotAdherence([
        row('2026-11-02', 1800, { mealSlots: slots(1, 0) }),
        row('2026-11-03', 1800, { mealSlots: slots(2, 1) }),
        row('2026-11-04', 1800, { mealSlots: slots(0, 0) }),
      ]),
    ).toEqual([
      {
        slotCode: 'BREAKFAST',
        plannedDays: 3,
        loggedDays: 2,
        adherencePct: (2 * 100) / 3,
        offPlanDays: 0,
      },
      { slotCode: 'LUNCH', plannedDays: 3, loggedDays: 0, adherencePct: 0, offPlanDays: 0 },
      { slotCode: 'SNACK', plannedDays: 0, loggedDays: 0, adherencePct: null, offPlanDays: 1 },
    ]);
  });
});
