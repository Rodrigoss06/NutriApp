import { describe, expect, it } from 'vitest';
import { runMethod } from '../registry/run-method.js';
import {
  MUSCLE_FATIGUE_JV,
  type MuscleFatigueInput,
  type MuscleFatigueThresholds,
  type MuscleVolume,
} from './muscle-fatigue.js';

// P-27, respuesta de Jeremy (2026-11-10): el estado con los umbrales de P-23 (ámbar sobre +15 % y rojo sobre +30 % de la base) y
// la recuperación estimada en 48, 60 y 72 h.
const JV: MuscleFatigueThresholds = {
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
  recoveryGreenHours: 48,
  recoveryAmberHours: 60,
  recoveryRedHours: 72,
};

const muscles = (volumes: Readonly<Record<string, number | null>>): MuscleVolume[] =>
  Object.entries(volumes).map(([muscleCode, adjustedVolumeKg]) => ({
    muscleCode,
    adjustedVolumeKg,
  }));

const fatigue = (input: Omit<MuscleFatigueInput, 'thresholds'>, thresholds = JV) => {
  const run = runMethod(MUSCLE_FATIGUE_JV, { ...input, thresholds });
  if (!run.ok) throw new Error(JSON.stringify(run.errors));
  return run.result;
};

const rowOf = (result: ReturnType<typeof fatigue>, code: string) =>
  result.outputs.muscles.find((row) => row.muscleCode === code);

// Las semanas 2 a 4 de una hoja como la de Mateo: el press banca da 1,419 de promedio al pecho (principal, 1.0) y la mitad al
// tríceps (secundario, 0.5), como decidió Rodrigo el 2026-11-11.
const PREVIOUS = [
  { adjustedVolumeKg: 5490, muscles: muscles({ CHEST: 1350, TRICEPS: 675, QUADRICEPS: 2000 }) },
  { adjustedVolumeKg: 6336, muscles: muscles({ CHEST: 1500, TRICEPS: 750, QUADRICEPS: 2400 }) },
  { adjustedVolumeKg: 3375, muscles: muscles({ CHEST: 1407, TRICEPS: 703.5 }) },
];

describe('RN-G16 · P-27 · fatiga por grupo muscular de la hoja piloto', () => {
  it('la base de cada grupo es el promedio de las 3 semanas previas con volumen: Pecho 1,419 y Tríceps 709.5', () => {
    const result = fatigue({
      muscles: muscles({ CHEST: 1419, TRICEPS: 709.5 }),
      previousWeeks: PREVIOUS,
    });
    expect(rowOf(result, 'CHEST')).toEqual({
      muscleCode: 'CHEST',
      trainingFatigueKg: 1419,
      baseVolumeKg: 1419,
      changePct: 0,
      state: 'GREEN',
      recoveryHours: 48,
    });
    expect(rowOf(result, 'TRICEPS')?.baseVolumeKg).toBe(709.5);
    expect(result.outputs.baseWeeks).toBe(3);
    expect(result.methodCode).toBe('MUSCLE_FATIGUE_JV');
    expect(result.methodVersion).toBe('1.0.0');
  });

  it('una semana previa con volumen en la que el grupo no se entrenó cuenta como 0: Cuádriceps (2,000 + 2,400 + 0) ÷ 3', () => {
    const result = fatigue({ muscles: muscles({ QUADRICEPS: 1500 }), previousWeeks: PREVIOUS });
    expect(rowOf(result, 'QUADRICEPS')?.baseVolumeKg).toBeCloseTo(4400 / 3, 9);
  });

  it('P-24 · las semanas previas sin volumen no entran en la base: ni en la suma ni en el divisor', () => {
    const result = fatigue({
      muscles: muscles({ CHEST: 1000 }),
      previousWeeks: [
        { adjustedVolumeKg: 3375, muscles: muscles({ CHEST: 1407 }) },
        { adjustedVolumeKg: null, muscles: muscles({ CHEST: null }) },
        { adjustedVolumeKg: 0, muscles: [] },
      ],
    });
    expect(rowOf(result, 'CHEST')?.baseVolumeKg).toBe(1407);
    expect(result.outputs.baseWeeks).toBe(1);
  });

  it('P-23 · verde hasta +15 %, ámbar hasta +30 % y rojo sobre +30 %, con 48, 60 y 72 h de recuperación', () => {
    const at = (volume: number) =>
      rowOf(
        fatigue({
          muscles: muscles({ CHEST: volume }),
          previousWeeks: [{ adjustedVolumeKg: 1000, muscles: muscles({ CHEST: 1000 }) }],
        }),
        'CHEST',
      );
    expect(at(1150)).toMatchObject({ state: 'GREEN', recoveryHours: 48 });
    expect(at(1151)).toMatchObject({ state: 'AMBER', recoveryHours: 60 });
    // +30 % exacto sigue en ámbar: se compara sin dividir.
    expect(at(1300)).toMatchObject({ state: 'AMBER', recoveryHours: 60 });
    expect(at(1301)).toMatchObject({ state: 'RED', recoveryHours: 72 });
    expect(at(600)).toMatchObject({ state: 'GREEN', changePct: -40, recoveryHours: 48 });
  });

  it('un grupo con base y sin volumen en la semana queda «faltan datos», como la semana 5 de la hoja', () => {
    const result = fatigue({ muscles: [], previousWeeks: PREVIOUS });
    expect(result.outputs.muscles.map((row) => row.muscleCode)).toEqual([
      'CHEST',
      'TRICEPS',
      'QUADRICEPS',
    ]);
    expect(rowOf(result, 'CHEST')).toEqual({
      muscleCode: 'CHEST',
      trainingFatigueKg: null,
      baseVolumeKg: 1419,
      changePct: null,
      state: 'NO_DATA',
      recoveryHours: null,
    });
  });

  it('sin semanas previas con volumen, o con el grupo en 0 en todas, queda «sin base» y sin recuperación estimada', () => {
    const first = fatigue({ muscles: muscles({ CHEST: 1200 }), previousWeeks: [] });
    expect(rowOf(first, 'CHEST')).toMatchObject({
      baseVolumeKg: null,
      changePct: null,
      state: 'NO_BASE',
      recoveryHours: null,
    });
    const newMuscle = fatigue({ muscles: muscles({ CALVES: 300 }), previousWeeks: PREVIOUS });
    expect(rowOf(newMuscle, 'CALVES')).toMatchObject({
      baseVolumeKg: 0,
      changePct: null,
      state: 'NO_BASE',
    });
  });

  it('primero los grupos de la semana, en su orden, y después los que solo están en la base', () => {
    const result = fatigue({
      muscles: muscles({ GLUTES: 800, CHEST: null }),
      previousWeeks: PREVIOUS,
    });
    expect(result.outputs.muscles.map((row) => row.muscleCode)).toEqual([
      'GLUTES',
      'CHEST',
      'TRICEPS',
      'QUADRICEPS',
    ]);
    expect(rowOf(result, 'CHEST')?.state).toBe('NO_DATA');
  });

  it('insumos fuera de rango o umbrales cruzados dan su código', () => {
    const error = (input: Omit<MuscleFatigueInput, 'thresholds'>, thresholds = JV) => {
      const run = runMethod(MUSCLE_FATIGUE_JV, { ...input, thresholds });
      return run.ok ? null : run.errors.map((issue) => issue.code);
    };
    expect(error({ muscles: muscles({ CHEST: -1 }), previousWeeks: [] })).toEqual(['NC-ENG-415']);
    expect(
      error({ muscles: [...muscles({ CHEST: 1 }), ...muscles({ CHEST: 2 })], previousWeeks: [] }),
    ).toEqual(['NC-ENG-415']);
    expect(error({ muscles: [], previousWeeks: [...PREVIOUS, ...PREVIOUS] })).toEqual([
      'NC-ENG-415',
    ]);
    expect(error({ muscles: [], previousWeeks: [] }, { ...JV, recoveryAmberHours: 80 })).toEqual([
      'NC-ENG-416',
    ]);
    expect(error({ muscles: [], previousWeeks: [] }, { ...JV, loadAmberAbovePct: 40 })).toEqual([
      'NC-ENG-416',
    ]);
  });
});
