import { describe, expect, it } from 'vitest';
import { dailyTargetOf, replacesActivePlan } from './active-plan.js';

describe('RN-G03 · la meta de cada día sale del plan vigente', () => {
  it('kcal, macronutrientes y agua del plan publicado, con las metas exactas', () => {
    expect(
      dailyTargetOf({
        targets: { kcal: 1834.5357, choG: 183.9754, proteinG: 160, fatG: 50.9593 },
        hydrationTargetMl: 2_500,
      }),
    ).toEqual({ kcal: 1834.5357, choG: 183.9754, proteinG: 160, fatG: 50.9593, waterMl: 2_500 });
  });
});

describe('RN-E14 · la copia del plan vigente solo avanza', () => {
  it('un plan reemplaza al activo si se publicó después o a la vez (reintento); uno anterior que llega tarde, no', () => {
    expect(replacesActivePlan(null, '2026-10-22T15:00:00.000Z')).toBe(true);
    expect(replacesActivePlan('2026-10-22T15:00:00.000Z', '2026-10-22T16:00:00.000Z')).toBe(true);
    expect(replacesActivePlan('2026-10-22T15:00:00.000Z', '2026-10-22T15:00:00.000Z')).toBe(true);
    expect(replacesActivePlan('2026-10-22T16:00:00.000Z', '2026-10-22T15:00:00.000Z')).toBe(false);
  });
});
