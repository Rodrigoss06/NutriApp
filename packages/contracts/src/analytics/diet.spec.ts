import { describe, expect, it } from 'vitest';
import { dietAnalyticsSchema, dietDaySchema } from './diet.js';

const DAY = {
  localDate: '2026-11-02',
  dayKind: 'TRAINING',
  kcal: 1790,
  choG: 200,
  proteinG: 150,
  fatG: 50,
  fiberG: null,
  targetKcal: 1834.5,
  targetChoG: 184,
  targetProteinG: 160,
  targetFatG: 51,
  adequacyKcalPct: 97.6,
  adequacyChoPct: 108.7,
  adequacyProteinPct: 93.8,
  adequacyFatPct: 98,
  kcalInRange: true,
  mealsLogged: 1,
  mealsPlanned: null,
  offPlanItems: 1,
  waterMl: null,
  waterTargetMl: 2500,
  nutrientsMissing: { items: 1, kcal: 0, choG: 0, proteinG: 0, fatG: 0, fiberG: 1 },
};

describe('RF-32 · RN-I03 · contrato de la analítica de dieta', () => {
  it('acepta un día con lo conocido, sin agua registrada y con la fibra faltante', () => {
    expect(dietDaySchema.parse(DAY)).toEqual(DAY);
  });

  it('rechaza conteos negativos o con decimales', () => {
    expect(dietDaySchema.safeParse({ ...DAY, mealsLogged: -1 }).success).toBe(false);
    expect(
      dietDaySchema.safeParse({ ...DAY, nutrientsMissing: { ...DAY.nutrientsMissing, items: 1.5 } })
        .success,
    ).toBe(false);
  });

  it('cada adecuación lleva su método (RN-D02)', () => {
    const analytics = {
      from: '2026-10-26',
      to: '2026-11-01',
      adequacyRangePct: [90, 110],
      method: { code: 'ADEQUACY', version: '1.0.0' },
      days: [DAY],
      weeks: [],
      mealSlots: [],
    };
    expect(dietAnalyticsSchema.parse(analytics).method.code).toBe('ADEQUACY');
    expect(
      dietAnalyticsSchema.safeParse({ ...analytics, method: { code: 'TEE_PAL', version: '1.0.0' } })
        .success,
    ).toBe(false);
  });
});
