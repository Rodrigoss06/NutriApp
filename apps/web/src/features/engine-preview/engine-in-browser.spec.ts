// @vitest-environment happy-dom
import {
  ENGINE_VERSION,
  FAT_DW1974_SIRI1961,
  inputsHash,
  kg,
  mm,
  runMethod,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';

describe('P1 · el motor se importa en el navegador sin polyfills (vistas previas, 02 §11)', () => {
  it('calcula Durnin y Womersley + Siri con el mismo sobre que en el servidor (G-06)', () => {
    const run = runMethod(FAT_DW1974_SIRI1961, {
      sex: 'M',
      ageYears: 28,
      population: 'ADULT',
      weightKg: kg(80),
      skinfoldsMm: { triceps: mm(12), biceps: mm(6), subscapular: mm(16), iliacCrest: mm(22) },
    });

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.result.outputs.fatPct).toBeCloseTo(20.26, 2);
    expect(run.result.engineVersion).toBe(ENGINE_VERSION);
    expect(run.result.inputsHash).toBe(inputsHash(run.result.inputs));
  });
});
