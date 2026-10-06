import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FAT_DW1974_SIRI1961,
  FAT_FAULKNER1968,
  FAT_JP1978_7,
  FAT_YUHASZ1974,
} from '../../src/body-composition/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import type { MethodDefinition, Sex } from '../../src/registry/types.js';
import { kg, mm, type Mm } from '../../src/units.js';
import { expectOk } from '../support.js';

const skinfold = fc.double({ min: 1, max: 80, noNaN: true });
const sex = fc.constantFrom<Sex>('M', 'F');

type SkinfoldMethod = MethodDefinition<
  {
    sex: Sex;
    ageYears: number;
    population: 'ADULT';
    weightKg: ReturnType<typeof kg>;
    skinfoldsMm: Record<string, Mm>;
  },
  { fatPct: number }
>;

/** Sube un pliegue cualquiera y comprueba que el % de grasa no baja. */
function neverDecreases(
  method: SkinfoldMethod,
  sites: readonly string[],
  maxSumMm = Number.POSITIVE_INFINITY,
) {
  fc.assert(
    fc.property(
      sex,
      fc.array(skinfold, { minLength: sites.length, maxLength: sites.length }),
      fc.nat({ max: sites.length - 1 }),
      // Desde 0.1 mm, la resolución del plicómetro: por debajo solo hay ruido de coma flotante.
      fc.double({ min: 0.1, max: 20, noNaN: true }),
      (patientSex, values, index, extraMm) => {
        const base = values.map((value) => value);
        fc.pre((base[index] ?? 0) + extraMm <= 80);
        const raised = base.map((value, i) => (i === index ? value + extraMm : value));
        fc.pre(raised.reduce((a, b) => a + b, 0) <= maxSumMm);
        const fatPct = (mmValues: number[]) =>
          expectOk(
            runMethod(method, {
              sex: patientSex,
              ageYears: 30,
              population: 'ADULT',
              weightKg: kg(70),
              skinfoldsMm: Object.fromEntries(sites.map((site, i) => [site, mm(mmValues[i] ?? 0)])),
            }),
          ).outputs.fatPct;
        expect(fatPct(raised)).toBeGreaterThanOrEqual(fatPct(base));
      },
    ),
  );
}

describe('03 · propiedad: más milímetros en cualquier pliegue nunca bajan el % de grasa', () => {
  it('Durnin y Womersley + Siri', () => {
    neverDecreases(FAT_DW1974_SIRI1961 as unknown as SkinfoldMethod, [
      'triceps',
      'biceps',
      'subscapular',
      'iliacCrest',
    ]);
  });

  it('Faulkner', () => {
    neverDecreases(FAT_FAULKNER1968 as unknown as SkinfoldMethod, [
      'triceps',
      'subscapular',
      'supraspinale',
      'abdominal',
    ]);
  });

  it('Yuhasz', () => {
    neverDecreases(FAT_YUHASZ1974 as unknown as SkinfoldMethod, [
      'triceps',
      'subscapular',
      'supraspinale',
      'abdominal',
      'frontThigh',
      'medialCalf',
    ]);
  });

  it('Jackson y Pollock 7, mientras la suma no pase el vértice de su parábola (395 mm en hombres)', () => {
    neverDecreases(
      FAT_JP1978_7 as unknown as SkinfoldMethod,
      ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'frontThigh'],
      0.00043499 / (2 * 0.00000055),
    );
  });
});
