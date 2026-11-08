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

describe('RN-G03 · 07 §2 · la meta de alimentación de un día de entrenamiento o de descanso', () => {
  // La hoja piloto de JV Fitness (Mateo Prueba): 2,500 kcal el día de entrenamiento y 2,250 el de descanso.
  const MATEO = {
    targets: { kcal: 2500, choG: 307.5, proteinG: 160, fatG: 70 },
    restDayTargets: { kcal: 2250, choG: 245, proteinG: 160, fatG: 70 },
    hydrationTargetMl: 3_000,
  };

  it('un día de descanso lleva la meta de descanso del plan, con la misma agua', () => {
    expect(dailyTargetOf(MATEO, 'REST')).toEqual({
      kcal: 2250,
      choG: 245,
      proteinG: 160,
      fatG: 70,
      waterMl: 3_000,
    });
  });

  it('un día de entrenamiento lleva la de la prescripción', () => {
    expect(dailyTargetOf(MATEO, 'TRAINING')).toEqual({
      kcal: 2500,
      choG: 307.5,
      proteinG: 160,
      fatG: 70,
      waterMl: 3_000,
    });
  });

  it('sin programa (un día sin tipo) vale la de la prescripción', () => {
    expect(dailyTargetOf(MATEO, null).kcal).toBe(2500);
  });

  it('un plan sin metas de descanso, o un snapshot de la versión 1, tiene una sola meta', () => {
    const single = { targets: MATEO.targets, hydrationTargetMl: MATEO.hydrationTargetMl };
    expect(dailyTargetOf(single, 'REST').kcal).toBe(2500);
    expect(dailyTargetOf({ ...single, restDayTargets: null }, 'REST').kcal).toBe(2500);
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
