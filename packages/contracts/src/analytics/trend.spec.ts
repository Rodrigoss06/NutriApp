import { describe, expect, it } from 'vitest';
import { dietTrendSchema } from './trend.js';

const nutrient = { consumed: 1945, target: 1834.54, adequacyPct: 106.0, complete: true };
const month = {
  month: '2026-10',
  daysWithTarget: 6,
  daysLogged: 6,
  daysInRange: 3,
  kcal: nutrient,
  sessionsDone: 3,
  sessionsPlanned: null,
};

describe('RN-G09 · la tendencia por mes', () => {
  it('cada mes como YYYY-MM; sin meta de entrenamiento, las programadas quedan sin dato', () => {
    const trend = {
      from: '2026-10-01',
      to: '2026-11-06',
      adequacyRangePct: [90, 110],
      method: { code: 'ADEQUACY', version: '1.0.0' },
      months: [month],
    };
    expect(dietTrendSchema.parse(trend).months[0]?.sessionsPlanned).toBeNull();
    expect(
      dietTrendSchema.safeParse({ ...trend, months: [{ ...month, month: '2026-13' }] }).success,
    ).toBe(false);
  });
});
