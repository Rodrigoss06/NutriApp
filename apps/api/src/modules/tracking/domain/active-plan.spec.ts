import { describe, expect, it } from 'vitest';
import { dailyTargetOf, replacesActivePlan } from './active-plan.js';

describe('RN-G03 · la meta de cada día sale del plan vigente', () => {
  it('kcal, macronutrientes y agua del plan publicado, con las metas exactas', () => {
    expect(
      dailyTargetOf({
        targets: { kcal: 1834.5357, choG: 183.9754, proteinG: 160, fatG: 50.9593 },
        hydrationTargetMl: 2_500,
      }),
    ).toEqual({
      kcal: 1834.5357,
      choG: 183.9754,
      proteinG: 160,
      fatG: 50.9593,
      waterMl: 2_500,
      profileCode: null,
      profileName: null,
    });
  });
});

describe('RN-G03 · 07 §2 · P-20.4 · la meta de alimentación de cada día según su perfil', () => {
  // La hoja piloto de JV Fitness con las respuestas de Jeremy: mandan los gramos (P-20.2), así que Mateo tiene 2,510 kcal
  // el día de entrenamiento y 2,230 el de descanso; «Alto» es un perfil propio para el día de pierna (P-20.4).
  const MATEO = {
    targets: { kcal: 2510, choG: 310, proteinG: 160, fatG: 70 },
    dayProfiles: [
      { code: 'REST', name: 'Descanso', kcal: 2230, choG: 240, proteinG: 160, fatG: 70 },
      { code: 'ALTO', name: 'Alto', kcal: 2590, choG: 330, proteinG: 160, fatG: 70 },
    ],
    hydrationTargetMl: 3_000,
  };

  it('un día de descanso lleva el perfil Descanso, con la misma agua', () => {
    expect(dailyTargetOf(MATEO, 'REST')).toEqual({
      kcal: 2230,
      choG: 240,
      proteinG: 160,
      fatG: 70,
      waterMl: 3_000,
      profileCode: 'REST',
      profileName: 'Descanso',
    });
  });

  it('una sesión con su perfil propio lleva ese perfil', () => {
    expect(dailyTargetOf(MATEO, 'ALTO')).toMatchObject({
      kcal: 2590,
      profileCode: 'ALTO',
      profileName: 'Alto',
    });
  });

  it('Entrenamiento, un día sin programa o un perfil que el plan no tiene llevan la meta de la prescripción', () => {
    const training = { kcal: 2510, profileCode: 'TRAINING', profileName: 'Entrenamiento' };
    expect(dailyTargetOf(MATEO, 'TRAINING')).toMatchObject(training);
    expect(dailyTargetOf(MATEO, null)).toMatchObject(training);
    expect(dailyTargetOf(MATEO, 'MEDIO')).toMatchObject(training);
  });

  it('un plan sin perfiles, o un snapshot anterior a la versión 3, tiene una sola meta y ningún perfil', () => {
    const single = { targets: MATEO.targets, hydrationTargetMl: MATEO.hydrationTargetMl };
    expect(dailyTargetOf(single, 'REST')).toMatchObject({
      kcal: 2510,
      profileCode: null,
      profileName: null,
    });
    expect(dailyTargetOf({ ...single, dayProfiles: [] }, 'ALTO').profileCode).toBeNull();
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
