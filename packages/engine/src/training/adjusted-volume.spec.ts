import { describe, expect, it } from 'vitest';
import { runMethod } from '../registry/run-method.js';
import { ADJUSTED_VOLUME, type VolumeFactorTables } from './adjusted-volume.js';

// P-26, respuesta de Jeremy (2026-11-10): RIR 0 a 5 o más, y el descanso de 45 s a 180 s o más.
const JV_FACTORS: VolumeFactorTables = {
  rir: [
    { from: 0, factor: 1.3, orMore: false },
    { from: 1, factor: 1.2, orMore: false },
    { from: 2, factor: 1.1, orMore: false },
    { from: 3, factor: 1.0, orMore: false },
    { from: 4, factor: 0.9, orMore: false },
    { from: 5, factor: 0.8, orMore: true },
  ],
  rest: [
    { from: 45, factor: 1.15, orMore: false },
    { from: 60, factor: 1.1, orMore: false },
    { from: 75, factor: 1.05, orMore: false },
    { from: 90, factor: 1.0, orMore: false },
    { from: 120, factor: 1.0, orMore: false },
    { from: 180, factor: 0.95, orMore: true },
  ],
};

const set = (
  id: string,
  overrides: Partial<{
    reps: number | null;
    loadKg: number | null;
    rir: number | null;
    rpe: number | null;
    restSeconds: number | null;
  }> = {},
) => ({
  id,
  reps: 12,
  loadKg: 45,
  rir: 2,
  rpe: null,
  restSeconds: 120,
  ...overrides,
});

const run = (sets: ReturnType<typeof set>[], factors = JV_FACTORS) => {
  const result = runMethod(ADJUSTED_VOLUME, { sets, factors });
  if (!result.ok) throw new Error('El método falló.');
  return result.result;
};

describe('RN-F18 · volumen ajustado = volumen × factor RIR × factor descanso (P-26)', () => {
  it('G-42 · el ejemplo de la hoja: 3 × 12 × 45 kg con RIR 2 y 120 s da 1,620 de volumen y 1,782 ajustado', () => {
    const result = run([set('a'), set('b'), set('c')]);
    expect(result.outputs.volumeKg).toBe(1_620);
    expect(result.outputs.adjustedVolumeKg).toBeCloseTo(1_782, 9);
    expect(result.outputs.unfactoredSets).toBe(0);
    expect(result.outputs.sets[0]).toEqual({
      id: 'a',
      volumeKg: 540,
      rirFactor: 1.1,
      restFactor: 1,
      adjustedVolumeKg: expect.closeTo(594, 9) as number,
    });
    expect(result.methodCode).toBe('ADJUSTED_VOLUME');
    expect(result.methodVersion).toBe('1.1.0');
  });

  it('RIR 5 o más vale 0.8, y 180 s o más vale 0.95', () => {
    const result = run([set('a', { rir: 7, restSeconds: 240 })]);
    expect(result.outputs.sets[0]).toMatchObject({ rirFactor: 0.8, restFactor: 0.95 });
    expect(result.outputs.adjustedVolumeKg).toBeCloseTo(540 * 0.8 * 0.95, 9);
  });

  it('sin RIR ni RPE, o sin descanso prescrito, queda «sin factor», nunca como 1', () => {
    const result = run([
      set('sin-rir', { rir: null }),
      set('sin-descanso', { restSeconds: null }),
      set('ok'),
    ]);
    expect(result.outputs.sets.map((row) => row.adjustedVolumeKg)).toEqual([
      null,
      null,
      expect.closeTo(594, 9),
    ]);
    expect(result.outputs.sets[0]).toMatchObject({ rirFactor: null, restFactor: 1 });
    expect(result.outputs.volumeKg).toBe(1_620);
    expect(result.outputs.adjustedVolumeKg).toBeCloseTo(594, 9);
    expect(result.outputs.unfactoredSets).toBe(2);
  });

  // ADR-113 · respuesta de Rodrigo (2026-11-11): por tramos, ningún descanso cae en un vacío.
  it.each([
    [30, 1.15],
    [45, 1.15],
    [46, 1.1],
    [60, 1.1],
    [61, 1.05],
    [75, 1.05],
    [76, 1],
    [100, 1],
    [150, 1],
    [179, 1],
    [180, 0.95],
    [240, 0.95],
  ])('el descanso por tramos: %i s vale %d', (restSeconds, factor) => {
    expect(run([set('a', { restSeconds })]).outputs.sets[0]?.restFactor).toBe(factor);
  });

  it('RN-F05 · con RPE y sin RIR, el RIR es 10 − RPE entre 0 y 5: RPE 8 = RIR 2 = 1.1', () => {
    const factorOf = (rpe: number) =>
      run([set('a', { rir: null, rpe })]).outputs.sets[0]?.rirFactor;
    expect(factorOf(8)).toBe(1.1);
    expect(factorOf(10)).toBe(1.3);
    expect(factorOf(4)).toBe(0.8);
    // Con el RIR registrado, manda el RIR.
    expect(run([set('a', { rir: 3, rpe: 9 })]).outputs.sets[0]?.rirFactor).toBe(1);
  });

  it('un RPE con decimal sigue la fórmula de Jeremy: RPE 8.5 = RIR 1.5 = 1.15', () => {
    const [row] = run([set('a', { rir: null, rpe: 8.5 })]).outputs.sets;
    expect(row?.rirFactor).toBeCloseTo(1.15, 12);
    expect(row?.adjustedVolumeKg).toBeCloseTo(540 * 1.15, 9);
    expect(run([set('a', { rir: null, rpe: 5.5 })]).outputs.sets[0]?.rirFactor).toBeCloseTo(
      0.85,
      12,
    );
  });

  it('sin carga (peso corporal sin lastre, movilidad o cardio) aporta 0 kg, con o sin factor', () => {
    const result = run([
      set('plancha', { loadKg: null, rir: null, restSeconds: null }),
      set('dominada', { loadKg: 0 }),
    ]);
    expect(result.outputs.sets.map((row) => row.adjustedVolumeKg)).toEqual([0, 0]);
    expect(result.outputs.unfactoredSets).toBe(0);
  });

  it('sin series, todo en 0', () => {
    expect(run([]).outputs).toEqual({
      sets: [],
      volumeKg: 0,
      adjustedVolumeKg: 0,
      unfactoredSets: 0,
    });
  });

  it('una tabla con un factor que no es positivo o un valor repetido, o una serie negativa, dan su código', () => {
    const error = (sets: ReturnType<typeof set>[], factors: VolumeFactorTables) => {
      const result = runMethod(ADJUSTED_VOLUME, { sets, factors });
      if (result.ok) return null;
      expect(result.errors.map((issue) => issue.rule)).toEqual(result.errors.map(() => 'RN-F18'));
      return result.errors.map((issue) => issue.code);
    };
    expect(
      error([set('a')], { ...JV_FACTORS, rir: [{ from: 0, factor: 0, orMore: true }] }),
    ).toEqual(['NC-ENG-411']);
    expect(
      error([set('a')], {
        ...JV_FACTORS,
        rest: [
          { from: 90, factor: 1, orMore: false },
          { from: 90, factor: 1.1, orMore: false },
        ],
      }),
    ).toEqual(['NC-ENG-411']);
    expect(error([set('a', { reps: -1 })], JV_FACTORS)).toEqual(['NC-ENG-412']);
    expect(error([set('a', { rpe: 10.5 })], JV_FACTORS)).toEqual(['NC-ENG-412']);
  });
});
