import { describe, expect, it } from 'vitest';
import type { FatiguePanelThresholdRow } from '../../training/index.js';
import type { PanelWeekInput } from './fatigue-panel.js';
import { muscleFatigueOf, type MuscleWeekVolume } from './muscle-fatigue.js';

const JV: FatiguePanelThresholdRow = {
  id: 'global',
  organizationId: null,
  validFrom: '2026-01-01',
  recoveryRedStressMin: 4,
  recoveryRedSleepBelowHours: 6,
  recoveryAmberStressMin: 3,
  recoveryAmberSleepBelowHours: 7,
  fatigueRedMin: 4,
  fatigueAmberMin: 3,
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
  muscleRecoveryGreenHours: 48,
  muscleRecoveryAmberHours: 60,
  muscleRecoveryRedHours: 72,
  // P-27, respuesta de Jeremy (2026-11-10): los coeficientes de cada familia de ejercicio.
  familyCoefficients: [
    {
      family: 'LEG_HIP',
      muscularFatigue: 1.2,
      neuralFatigue: 1.3,
      axialLoad: 1.3,
      technicalDemand: 1.2,
    },
    {
      family: 'FREE_TORSO',
      muscularFatigue: 1.1,
      neuralFatigue: 1.1,
      axialLoad: 1.0,
      technicalDemand: 1.1,
    },
    {
      family: 'GUIDED',
      muscularFatigue: 1.0,
      neuralFatigue: 1.0,
      axialLoad: 0.8,
      technicalDemand: 0.9,
    },
    {
      family: 'ISOLATION',
      muscularFatigue: 0.9,
      neuralFatigue: 0.7,
      axialLoad: 0.5,
      technicalDemand: 0.8,
    },
    {
      family: 'MOBILITY_CARDIO',
      muscularFatigue: 0,
      neuralFatigue: 0,
      axialLoad: 0,
      technicalDemand: 0,
    },
  ],
};

const startOf = (weekNo: number) => `2026-10-${String(6 + 7 * (weekNo - 1)).padStart(2, '0')}`;

const week = (weekNo: number, adjustedVolumeKg: number | null, started = true): PanelWeekInput => ({
  weekNo,
  weekStart: startOf(weekNo),
  started,
  adjustedVolumeKg,
  days: [],
});

// Todo sale del press banca, un compuesto libre de torso (P-27.2).
const volumes = (weekNo: number, byMuscle: Readonly<Record<string, number | null>>) =>
  Object.entries(byMuscle).map(([muscleCode, adjustedVolumeKg]): MuscleWeekVolume => ({
    weekStart: startOf(weekNo),
    muscleCode,
    adjustedVolumeKg,
    familyVolumes: adjustedVolumeKg === null ? null : [{ family: 'FREE_TORSO', adjustedVolumeKg }],
  }));

// Una hoja como la de Mateo: el press banca de las semanas 2 a 4 promedia 1,419 al pecho y la mitad al tríceps; la 5 cerró sin
// registros y la 6 no empezó.
const WEEKS = [
  week(1, 5220),
  week(2, 5490),
  week(3, 6336),
  week(4, 3375),
  week(5, null),
  week(6, null, false),
];
const ROWS = [
  ...volumes(1, { CHEST: 1300, TRICEPS: 650 }),
  ...volumes(2, { CHEST: 1350, TRICEPS: 675 }),
  ...volumes(3, { CHEST: 1500, TRICEPS: 750 }),
  ...volumes(4, { CHEST: 1407, TRICEPS: 703.5 }),
  ...volumes(5, { CHEST: null, TRICEPS: null }),
];

describe('RN-G16 · P-27 · la fatiga por grupo muscular de cada semana del macrociclo', () => {
  it('la semana 5 compara con las semanas 2 a 4: Pecho 1,419 y Tríceps 709.5, en «faltan datos» porque no se entrenó', () => {
    const fatigue = muscleFatigueOf(WEEKS, ROWS, [JV]);
    const fifth = fatigue.get(5);
    expect(fifth).toMatchObject({ thresholdId: 'global', baseWeeks: 3 });
    expect(fifth?.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fifth?.muscles.map(({ muscleCode, baseVolumeKg, state }) => [
        muscleCode,
        baseVolumeKg,
        state,
      ]),
    ).toEqual([
      ['CHEST', 1419, 'NO_DATA'],
      ['TRICEPS', 709.5, 'NO_DATA'],
    ]);
    expect(fatigue.get(6)).toBeNull();
  });

  it('la semana 3 sube +13.2 % sobre las semanas 1 y 2: verde y 48 h; con 1,600 kg sería ámbar y 60 h', () => {
    const third = muscleFatigueOf(WEEKS, ROWS, [JV]).get(3);
    expect(third?.muscles[0]).toMatchObject({
      muscleCode: 'CHEST',
      trainingFatigueKg: 1500,
      baseVolumeKg: 1325,
      state: 'GREEN',
      recoveryHours: 48,
    });
    const heavier = ROWS.map((row) =>
      row.weekStart === startOf(3) && row.muscleCode === 'CHEST'
        ? { ...row, adjustedVolumeKg: 1600 }
        : row,
    );
    expect(muscleFatigueOf(WEEKS, heavier, [JV]).get(3)?.muscles[0]).toMatchObject({
      state: 'AMBER',
      recoveryHours: 60,
    });
    expect(third?.muscles[0]?.changePct).toBeCloseTo(13.21, 2);
  });

  it('P-27.1 · los coeficientes del grupo salen de sus familias en la semana y de la versión vigente: Pecho 1.1, 1.1, 1.0 y 1.1', () => {
    const third = muscleFatigueOf(WEEKS, ROWS, [JV]).get(3);
    expect(third?.muscles[0]?.coefficients).toEqual({
      muscularFatigue: 1.1,
      neuralFatigue: 1.1,
      axialLoad: 1.0,
      technicalDemand: 1.1,
    });
    // En la semana 5 no se entrenó: sin coeficientes, aunque la base sí los tuvo.
    expect(muscleFatigueOf(WEEKS, ROWS, [JV]).get(5)?.muscles[0]?.coefficients).toBeNull();
    // Otra versión de los coeficientes cambia los números, no el estado ni las horas.
    const own = {
      ...JV,
      id: 'propia',
      familyCoefficients: JV.familyCoefficients.map((row) =>
        row.family === 'FREE_TORSO' ? { ...row, muscularFatigue: 1.5 } : row,
      ),
    };
    const ownThird = muscleFatigueOf(WEEKS, ROWS, [own]).get(3);
    expect(ownThird?.muscles[0]).toMatchObject({
      state: 'GREEN',
      recoveryHours: 48,
      coefficients: { muscularFatigue: 1.5 },
    });
    expect(ownThird?.thresholdId).toBe('propia');
  });

  it('una fila escrita antes de la migración, sin familias, deja al grupo sin coeficientes y con su estado', () => {
    const old = ROWS.map((row) => ({ ...row, familyVolumes: null }));
    expect(muscleFatigueOf(WEEKS, old, [JV]).get(3)?.muscles[0]).toMatchObject({
      state: 'GREEN',
      coefficients: null,
    });
  });

  it('la primera semana queda «sin base»; sin umbrales vigentes al empezar la semana, no hay fatiga por grupo', () => {
    expect(muscleFatigueOf(WEEKS, ROWS, [JV]).get(1)?.muscles[0]?.state).toBe('NO_BASE');
    const later = muscleFatigueOf(WEEKS, ROWS, [{ ...JV, validFrom: '2026-10-20' }]);
    expect(later.get(2)).toBeNull();
    expect(later.get(3)?.baseWeeks).toBe(2);
  });
});
