import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BMI,
  CONSOLIDATE_ISAK,
  MDC95,
  TEM_ISAK,
  WAIST_HEIGHT,
} from '../src/anthropometry/index.js';
import {
  BONE_ROCHA1975,
  COMP5_KERR1988,
  FAT_DW1974_SIRI1961,
  FAT_FAULKNER1968,
  FAT_JP1978_7,
  FAT_YUHASZ1974,
  MUSCLE_LEE2000,
  RESIDUAL_WURCH1974,
  type KerrInput,
} from '../src/body-composition/index.js';
import {
  ADEQUACY,
  DEMO_EXCHANGE_LIST,
  EXCHANGES_CLASSIC,
  MACROS_PROTEIN_FIRST,
  MEAL_SPLIT_LARGEST_REMAINDER,
} from '../src/diet/index.js';
import {
  BMR_SCHOFIELD1985,
  EE_MET_COMPENDIUM2024,
  FAT_LOSS_7700,
  RMR_CUNNINGHAM1980,
  RMR_HB1919,
  RMR_KATCH_MCARDLE,
  RMR_MIFFLIN1990,
  TARGET_WEIGHT_FAT_PCT,
} from '../src/energy/index.js';
import {
  ACROMIOILIAC_INDEX,
  CORMIC_INDEX,
  MANOUVRIER_INDEX,
} from '../src/proportionality/index.js';
import { runMethod } from '../src/registry/run-method.js';
import type { Sex } from '../src/registry/types.js';
import {
  COMPLIANCE,
  FRACTIONAL_SETS,
  ONERM_BRZYCKI1993,
  ONERM_EPLEY1985,
  RPE_FROM_RIR,
  TONNAGE,
} from '../src/training/index.js';
import { cm, kg, mm } from '../src/units.js';
import { LUIS, LUIS_SKINFOLD_PAIRS } from './fixtures/luis.js';
import { expectOk } from './support.js';

/** Las funciones de docs/reference/engine.ts que se comparan; se carga sin tipar su código. */
interface ReferenceEngine {
  consolidateMeasurement(
    attempts: number[],
    kind: 'skinfold' | 'other',
  ): { value: number | null; needsThird: boolean; diffPct: number };
  technicalErrorOfMeasurement(pairs: [number, number][]): { tem: number; temPct: number };
  minimalDetectableChange95(error: number): number;
  bmi(weightKg: number, heightCm: number): number;
  waistToHeightRatio(waistCm: number, heightCm: number): number;
  densityDurninWomersley(sex: Sex, age: number, s: Record<string, number>): number;
  fatPercentSiri(density: number): number;
  densityJacksonPollock7(sex: Sex, age: number, sum7: number): number;
  fatPercentFaulkner(sum4: number): number;
  fatPercentYuhasz(sex: Sex, sum6: number): number;
  boneMassRocha(heightM: number, wristM: number, femurM: number): number;
  residualMassWurch(sex: Sex, weightKg: number): number;
  skeletalMuscleLee(input: Record<string, number | Sex>): number;
  kerrFiveComponent(input: Record<string, unknown>): Record<string, number>;
  cormicIndex(sitting: number, height: number): number;
  manouvrierIndex(height: number, sitting: number): number;
  acromioIliacIndex(biiliocristal: number, biacromial: number): number;
  idealWeightForFatPct(ffm: number, target: number): number;
  rmrMifflin(sex: Sex, kg: number, cm: number, age: number): number;
  rmrHarrisBenedict1919(sex: Sex, kg: number, cm: number, age: number): number;
  bmrFaoWho(sex: Sex, kg: number, age: number): number;
  rmrCunningham(ffm: number): number;
  rmrKatchMcArdle(ffm: number): number;
  activityKcal(met: number, kg: number, minutes: number, net?: boolean): number;
  dailyTargetForFatLoss(
    tdee: number,
    kgPerMonth: number,
  ): { deficitKcal: number; targetKcal: number };
  macroTargets(
    kcal: number,
    kg: number,
    proteinGPerKg: number,
    fatPct: number,
  ): { cho: number; protein: number; fat: number };
  computeExchanges(
    target: { cho: number; protein: number; fat: number },
    fixed: { VEG: number; FRU: number; MILK: number },
  ): { plan: Record<string, number>; kcal: number; adequacy: Record<string, number> };
  distributeByMeals(total: number, shares: Record<string, number>): Record<string, number>;
  adequacyPct(consumed: number, target: number): number;
  tonnageKg(sets: { exercise: string; loadKg: number; reps: number }[]): number;
  oneRmEpley(load: number, reps: number): number;
  oneRmBrzycki(load: number, reps: number): number;
  rpeFromRir(rir: number): number;
  weeklySetsByMuscle(
    sets: { exercise: string; loadKg: number; reps: number }[],
    map: Record<string, { muscle: string; role: 'primary' | 'secondary' }[]>,
  ): Record<string, number>;
  compliancePct(done: number, planned: number): number;
}

let reference: ReferenceEngine;

beforeAll(async () => {
  const path = new URL('../../../docs/reference/engine.ts', import.meta.url).pathname;
  reference = (await import(/* @vite-ignore */ path)) as ReferenceEngine;
});

const ok = <TOutput>(run: Parameters<typeof expectOk<unknown, TOutput>>[0]): TOutput =>
  expectOk(run).outputs;
const sf = LUIS.skinfoldsMm;
const g = LUIS.girthsCm;
const b = LUIS.breadthsCm;

describe('Paridad con docs/reference/engine.ts · los números de examples.ts no cambian', () => {
  it('calidad del dato, indicadores y proporcionalidad de Luis', () => {
    for (const attempts of [
      [12, 12.4],
      [12, 13],
      [12, 13, 12.6],
    ]) {
      const expected = reference.consolidateMeasurement(attempts, 'skinfold');
      const actual = ok(runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts }));
      expect(actual.value).toBe(expected.value);
      expect(actual.diffPct).toBe(expected.diffPct);
      expect(actual.needsThird).toBe(expected.needsThird);
    }
    const tem = reference.technicalErrorOfMeasurement(LUIS_SKINFOLD_PAIRS);
    expect(ok(runMethod(TEM_ISAK, { pairs: LUIS_SKINFOLD_PAIRS }))).toEqual({
      temAbs: tem.tem,
      temRelPct: tem.temPct,
    });
    expect(ok(runMethod(MDC95, { measurementError: tem.tem })).mdc95).toBe(
      reference.minimalDetectableChange95(tem.tem),
    );
    expect(ok(runMethod(BMI, { weightKg: LUIS.weightKg, heightCm: LUIS.heightCm })).bmi).toBe(
      reference.bmi(80, 175),
    );
    expect(ok(runMethod(WAIST_HEIGHT, { waistCm: g.waist, heightCm: LUIS.heightCm })).ratio).toBe(
      reference.waistToHeightRatio(86, 175),
    );
    const heights = { heightCm: LUIS.heightCm, sittingHeightCm: LUIS.sittingHeightCm };
    expect(ok(runMethod(CORMIC_INDEX, heights)).index).toBe(reference.cormicIndex(91, 175));
    expect(ok(runMethod(MANOUVRIER_INDEX, heights)).index).toBe(reference.manouvrierIndex(175, 91));
    expect(
      ok(
        runMethod(ACROMIOILIAC_INDEX, {
          biiliocristalCm: b.biiliocristal,
          biacromialCm: b.biacromial,
        }),
      ).index,
    ).toBe(reference.acromioIliacIndex(28.5, 40));
  });

  it('composición corporal de Luis, con Kerr completo', () => {
    const density = reference.densityDurninWomersley('M', 28, {
      tricepsMm: 12,
      bicepsMm: 6,
      subscapularMm: 16,
      iliacCrestMm: 22,
    });
    const dw = ok(
      runMethod(FAT_DW1974_SIRI1961, {
        sex: 'M',
        ageYears: 28,
        population: 'ADULT',
        weightKg: LUIS.weightKg,
        skinfoldsMm: {
          triceps: sf.triceps,
          biceps: sf.biceps,
          subscapular: sf.subscapular,
          iliacCrest: sf.iliacCrest,
        },
      }),
    );
    expect(dw.density).toBe(density);
    expect(dw.fatPct).toBe(reference.fatPercentSiri(density));

    const kerrInput: KerrInput = {
      sex: 'M',
      ageYears: 28,
      weightKg: LUIS.weightKg,
      heightCm: LUIS.heightCm,
      sittingHeightCm: LUIS.sittingHeightCm,
      skinfoldsMm: {
        triceps: sf.triceps,
        subscapular: sf.subscapular,
        supraspinale: sf.supraspinale,
        abdominal: sf.abdominal,
        frontThigh: sf.frontThigh,
        medialCalf: sf.medialCalf,
      },
      girthsCm: { ...g },
      breadthsCm: { ...b },
    };
    const expected = reference.kerrFiveComponent({
      sex: 'M',
      weightKg: 80,
      heightCm: 175,
      sittingHeightCm: 91,
      adult: true,
      skinfoldsMm: kerrInput.skinfoldsMm,
      girthsCm: {
        headGirth: 57,
        armRelaxed: 33,
        forearm: 28,
        chest: 100,
        waist: 86,
        thigh: 55,
        calf: 37,
      },
      breadthsCm: {
        biacromial: 40,
        biiliocristal: 28.5,
        humerus: 7,
        femur: 9.8,
        transverseChest: 30,
        apChestDepth: 20,
      },
    });
    const kerr = ok(runMethod(COMP5_KERR1988, kerrInput));
    expect(kerr).toMatchObject({
      bodySurfaceAreaM2: expected.bsaM2,
      skinKg: expected.skinKg,
      adiposeKg: expected.adiposeKg,
      muscleKg: expected.muscleKg,
      headBoneKg: expected.headBoneKg,
      bodyBoneKg: expected.bodyBoneKg,
      residualKg: expected.residualKg,
      structuredMassKg: expected.structuredKg,
      structuredDiffPct: expected.diffPct,
    });
  });

  it('energía, metas, dieta y entrenamiento de Luis', () => {
    const subject = {
      sex: 'M',
      ageYears: 28,
      weightKg: LUIS.weightKg,
      heightCm: LUIS.heightCm,
    } as const;
    expect(ok(runMethod(RMR_MIFFLIN1990, subject)).rmrKcal).toBe(
      reference.rmrMifflin('M', 80, 175, 28),
    );
    expect(ok(runMethod(RMR_HB1919, subject)).rmrKcal).toBe(
      reference.rmrHarrisBenedict1919('M', 80, 175, 28),
    );
    expect(ok(runMethod(BMR_SCHOFIELD1985, subject)).rmrKcal).toBe(
      reference.bmrFaoWho('M', 80, 28),
    );

    const met = ok(
      runMethod(EE_MET_COMPENDIUM2024, {
        weightKg: LUIS.weightKg,
        activities: [{ met: 9.3, minutesPerSession: 30, sessionsPerWeek: 3 }],
      }),
    );
    expect(met.activities[0]?.grossKcalPerSession).toBe(reference.activityKcal(9.3, 80, 30));
    expect(met.activities[0]?.netKcalPerSession).toBe(reference.activityKcal(9.3, 80, 30, true));
    const tee =
      reference.rmrMifflin('M', 80, 175, 28) * 1.4 +
      (reference.activityKcal(9.3, 80, 30, true) * 3) / 7;
    const goal = reference.dailyTargetForFatLoss(tee, 3);
    expect(
      ok(
        runMethod(FAT_LOSS_7700, {
          teeKcal: tee,
          weightKg: LUIS.weightKg,
          fatChangeKgPerMonth: -3,
        }),
      ),
    ).toMatchObject({ deficitKcal: goal.deficitKcal, targetKcal: goal.targetKcal });

    const macros = reference.macroTargets(goal.targetKcal, 80, 2, 25);
    const ported = ok(
      runMethod(MACROS_PROTEIN_FIRST, {
        targetKcal: goal.targetKcal,
        weightKg: LUIS.weightKg,
        proteinGPerKg: 2,
        fatPctKcal: 25,
      }),
    );
    expect(ported).toEqual({ choG: macros.cho, proteinG: macros.protein, fatG: macros.fat });
    const exchanges = reference.computeExchanges(macros, { VEG: 4, FRU: 3, MILK: 3 });
    const portedExchanges = ok(
      runMethod(EXCHANGES_CLASSIC, {
        target: ported,
        fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
        list: DEMO_EXCHANGE_LIST,
      }),
    );
    expect(portedExchanges.servings).toEqual(exchanges.plan);
    expect(portedExchanges.kcal).toBe(exchanges.kcal);
    expect(portedExchanges.adequacyPct).toEqual(exchanges.adequacy);

    const week = [1790, 1950, 1600, 2100, 1830, 2400, 1700];
    const adequacy = ok(runMethod(ADEQUACY, { prescribed: goal.targetKcal, consumedDaily: week }));
    expect(adequacy.adequacyPct).toBeCloseTo(reference.adequacyPct(1910, goal.targetKcal), 12);

    const sets = [
      { exercise: 'Sentadilla', loadKg: kg(100), reps: 8 },
      { exercise: 'Press banca', loadKg: kg(70), reps: 10 },
    ];
    expect(ok(runMethod(TONNAGE, { sets })).tonnageKg).toBe(reference.tonnageKg(sets));
    expect(ok(runMethod(ONERM_EPLEY1985, { loadKg: kg(100), reps: 8 })).oneRmKg).toBe(
      reference.oneRmEpley(100, 8),
    );
    expect(ok(runMethod(ONERM_BRZYCKI1993, { loadKg: kg(100), reps: 8 })).oneRmKg).toBe(
      reference.oneRmBrzycki(100, 8),
    );
    expect(ok(runMethod(RPE_FROM_RIR, { rir: 2 })).rpe).toBe(reference.rpeFromRir(2));
    expect(ok(runMethod(COMPLIANCE, { done: 12, planned: 16 })).compliancePct).toBe(
      reference.compliancePct(12, 16),
    );
    expect(
      ok(
        runMethod(FRACTIONAL_SETS, {
          sets,
          muscleMap: {
            Sentadilla: [
              { muscle: 'Cuádriceps', role: 'PRIMARY' },
              { muscle: 'Isquiosurales', role: 'SECONDARY' },
            ],
          },
        }),
      ).setsByMuscle,
    ).toEqual(
      reference.weeklySetsByMuscle(sets, {
        Sentadilla: [
          { muscle: 'Cuádriceps', role: 'primary' },
          { muscle: 'Isquiosurales', role: 'secondary' },
        ],
      }),
    );
  });
});

describe('Paridad con docs/reference/engine.ts · insumos al azar dentro de cada ecuación', () => {
  const skinfold = fc.double({ min: 2, max: 40, noNaN: true });
  const sex = fc.constantFrom<Sex>('M', 'F');

  it('ecuaciones de grasa, hueso, residual y Lee', () => {
    fc.assert(
      fc.property(
        sex,
        fc.integer({ min: 20, max: 68 }),
        fc.array(skinfold, { minLength: 7, maxLength: 7 }),
        fc.double({ min: 45, max: 120, noNaN: true }),
        (patientSex, age, [s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0], weight) => {
          const weightKg = kg(weight);
          const subject = {
            sex: patientSex,
            ageYears: age,
            population: 'ADULT',
            weightKg,
          } as const;
          const dw = ok(
            runMethod(FAT_DW1974_SIRI1961, {
              ...subject,
              skinfoldsMm: {
                triceps: mm(s1),
                biceps: mm(s2),
                subscapular: mm(s3),
                iliacCrest: mm(s4),
              },
            }),
          );
          expect(dw.density).toBeCloseTo(
            reference.densityDurninWomersley(patientSex, age, {
              tricepsMm: s1,
              bicepsMm: s2,
              subscapularMm: s3,
              iliacCrestMm: s4,
            }),
            12,
          );
          expect(
            ok(
              runMethod(FAT_JP1978_7, {
                ...subject,
                skinfoldsMm: {
                  chest: mm(s1),
                  midaxillary: mm(s2),
                  triceps: mm(s3),
                  subscapular: mm(s4),
                  abdominal: mm(s5),
                  suprailiac: mm(s6),
                  frontThigh: mm(s7),
                },
              }),
            ).density,
          ).toBeCloseTo(
            reference.densityJacksonPollock7(patientSex, age, s1 + s2 + s3 + s4 + s5 + s6 + s7),
            12,
          );
          expect(
            ok(
              runMethod(FAT_FAULKNER1968, {
                ...subject,
                skinfoldsMm: {
                  triceps: mm(s1),
                  subscapular: mm(s2),
                  supraspinale: mm(s3),
                  abdominal: mm(s4),
                },
              }),
            ).fatPct,
          ).toBeCloseTo(reference.fatPercentFaulkner(s1 + s2 + s3 + s4), 12);
          expect(
            ok(
              runMethod(FAT_YUHASZ1974, {
                ...subject,
                skinfoldsMm: {
                  triceps: mm(s1),
                  subscapular: mm(s2),
                  supraspinale: mm(s3),
                  abdominal: mm(s4),
                  frontThigh: mm(s5),
                  medialCalf: mm(s6),
                },
              }),
            ).fatPct,
          ).toBeCloseTo(reference.fatPercentYuhasz(patientSex, s1 + s2 + s3 + s4 + s5 + s6), 12);
          expect(
            ok(runMethod(RESIDUAL_WURCH1974, { sex: patientSex, weightKg })).residualKg,
          ).toBeCloseTo(reference.residualMassWurch(patientSex, weight), 12);
          expect(
            ok(
              runMethod(BONE_ROCHA1975, {
                heightCm: cm(170),
                wristBreadthCm: cm(5 + s1 / 40),
                femurBreadthCm: cm(9),
              }),
            ).boneKg,
          ).toBeCloseTo(reference.boneMassRocha(1.7, (5 + s1 / 40) / 100, 0.09), 12);
          expect(
            ok(
              runMethod(MUSCLE_LEE2000, {
                sex: patientSex,
                ageYears: age,
                weightKg,
                heightCm: cm(170),
                ethnicityCoefficient: -2,
                girthsCm: { armRelaxed: cm(30), thigh: cm(54), calf: cm(36) },
                skinfoldsMm: { triceps: mm(s1), frontThigh: mm(s2), medialCalf: mm(s3) },
              }),
            ).skeletalMuscleKg,
          ).toBeCloseTo(
            reference.skeletalMuscleLee({
              sex: patientSex,
              ageYears: age,
              heightM: 1.7,
              ethnicity: -2,
              armGirthCm: 30,
              tricepsMm: s1,
              thighGirthCm: 54,
              frontThighMm: s2,
              calfGirthCm: 36,
              medialCalfMm: s3,
            }),
            12,
          );
        },
      ),
    );
  });

  it('energía de adultos, metas, macros, reparto y 1RM', () => {
    fc.assert(
      fc.property(
        sex,
        fc.integer({ min: 18, max: 90 }),
        fc.double({ min: 40, max: 150, noNaN: true }),
        fc.double({ min: 140, max: 200, noNaN: true }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 12 }),
        (patientSex, age, weight, height, total, reps) => {
          const subject = {
            sex: patientSex,
            ageYears: age,
            weightKg: kg(weight),
            heightCm: cm(height),
          };
          expect(ok(runMethod(RMR_MIFFLIN1990, subject)).rmrKcal).toBeCloseTo(
            reference.rmrMifflin(patientSex, weight, height, age),
            9,
          );
          expect(ok(runMethod(RMR_HB1919, subject)).rmrKcal).toBeCloseTo(
            reference.rmrHarrisBenedict1919(patientSex, weight, height, age),
            9,
          );
          expect(ok(runMethod(BMR_SCHOFIELD1985, subject)).rmrKcal).toBeCloseTo(
            reference.bmrFaoWho(patientSex, weight, age),
            9,
          );
          const ffm = {
            ageYears: age,
            fatFreeMassKg: kg(weight * 0.8),
            fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961',
          } as const;
          expect(ok(runMethod(RMR_CUNNINGHAM1980, ffm)).rmrKcal).toBeCloseTo(
            reference.rmrCunningham(weight * 0.8),
            9,
          );
          expect(ok(runMethod(RMR_KATCH_MCARDLE, ffm)).rmrKcal).toBeCloseTo(
            reference.rmrKatchMcArdle(weight * 0.8),
            9,
          );
          expect(
            ok(
              runMethod(TARGET_WEIGHT_FAT_PCT, {
                weightKg: kg(weight),
                fatFreeMassKg: kg(weight * 0.8),
                fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961',
                targetFatPct: 15,
              }),
            ).targetWeightKg,
          ).toBeCloseTo(reference.idealWeightForFatPct(weight * 0.8, 15), 12);
          const macros = reference.macroTargets(2000 + height, weight, 1.6, 25);
          expect(
            ok(
              runMethod(MACROS_PROTEIN_FIRST, {
                targetKcal: 2000 + height,
                weightKg: kg(weight),
                proteinGPerKg: 1.6,
                fatPctKcal: 25,
              }),
            ),
          ).toEqual({ choG: macros.cho, proteinG: macros.protein, fatG: macros.fat });
          const shares = { Desayuno: 25, Almuerzo: 35, Cena: 40 };
          expect(
            ok(
              runMethod(MEAL_SPLIT_LARGEST_REMAINDER, {
                totalServings: total,
                meals: Object.entries(shares).map(([meal, pct]) => ({ meal, pct })),
              }),
            ).servingsByMeal,
          ).toEqual(
            Object.entries(reference.distributeByMeals(total, shares)).map(([meal, servings]) => ({
              meal,
              servings,
            })),
          );
          expect(ok(runMethod(ONERM_EPLEY1985, { loadKg: kg(weight), reps })).oneRmKg).toBeCloseTo(
            reference.oneRmEpley(weight, reps),
            12,
          );
          expect(
            ok(runMethod(ONERM_BRZYCKI1993, { loadKg: kg(weight), reps })).oneRmKg,
          ).toBeCloseTo(reference.oneRmBrzycki(weight, reps), 12);
        },
      ),
    );
  });
});
