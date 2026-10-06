import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMP5_KERR1988, STRUCTURED_MASS_TOLERANCE_PCT } from '../../src/body-composition/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { cm, mm } from '../../src/units.js';
import { LUIS } from '../fixtures/luis.js';
import { expectOk } from '../support.js';

/** Escala cada medida de un grupo por su factor. */
const scaled = <T extends Record<string, number>>(
  values: T,
  factors: readonly number[],
  unit: (n: number) => number,
) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value], index) => [key, unit(value * (factors[index] ?? 1))]),
  ) as unknown as T;

describe('03 · propiedad: la suma de los cinco componentes del caso Luis queda dentro de ±5 % del peso', () => {
  it('con cada medida movida hasta ±1 %, el error técnico típico de un antropometrista', () => {
    const factor = fc.double({ min: 0.99, max: 1.01, noNaN: true });
    fc.assert(
      fc.property(
        fc.array(factor, { minLength: 6, maxLength: 6 }),
        fc.array(factor, { minLength: 7, maxLength: 7 }),
        fc.array(factor, { minLength: 6, maxLength: 6 }),
        (skinfoldFactors, girthFactors, breadthFactors) => {
          const sf = LUIS.skinfoldsMm;
          const g = LUIS.girthsCm;
          const b = LUIS.breadthsCm;
          const { structuredDiffPct } = expectOk(
            runMethod(COMP5_KERR1988, {
              sex: LUIS.sex,
              ageYears: LUIS.ageYears,
              weightKg: LUIS.weightKg,
              heightCm: LUIS.heightCm,
              sittingHeightCm: LUIS.sittingHeightCm,
              skinfoldsMm: scaled(
                {
                  triceps: sf.triceps,
                  subscapular: sf.subscapular,
                  supraspinale: sf.supraspinale,
                  abdominal: sf.abdominal,
                  frontThigh: sf.frontThigh,
                  medialCalf: sf.medialCalf,
                },
                skinfoldFactors,
                mm,
              ),
              girthsCm: scaled(
                {
                  head: g.head,
                  armRelaxed: g.armRelaxed,
                  forearm: g.forearm,
                  chest: g.chest,
                  waist: g.waist,
                  thigh: g.thigh,
                  calf: g.calf,
                },
                girthFactors,
                cm,
              ),
              breadthsCm: scaled(
                {
                  biacromial: b.biacromial,
                  biiliocristal: b.biiliocristal,
                  humerus: b.humerus,
                  femur: b.femur,
                  transverseChest: b.transverseChest,
                  apChestDepth: b.apChestDepth,
                },
                breadthFactors,
                cm,
              ),
            }),
          ).outputs;
          expect(Math.abs(structuredDiffPct)).toBeLessThanOrEqual(STRUCTURED_MASS_TOLERANCE_PCT);
        },
      ),
    );
  });
});
