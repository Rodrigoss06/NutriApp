import { describe, expect, it } from 'vitest';
import { FAT_DW1974_SIRI1961 } from '../../src/body-composition/index.js';
import {
  BMR_SCHOFIELD1985,
  EE_MET_COMPENDIUM2024,
  FAT_LOSS_7700,
  RMR_CUNNINGHAM1980,
  RMR_HB1919,
  RMR_KATCH_MCARDLE,
  RMR_MIFFLIN1990,
  TARGET_WEIGHT_FAT_PCT,
  TEE_PAL,
} from '../../src/energy/index.js';
import {
  ACROMIOILIAC_INDEX,
  CORMIC_INDEX,
  MANOUVRIER_INDEX,
} from '../../src/proportionality/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { kg } from '../../src/units.js';
import { LUIS } from '../fixtures/luis.js';
import { expectKcal, expectOk } from '../support.js';

const sf = LUIS.skinfoldsMm;
const twoC = () =>
  expectOk(
    runMethod(FAT_DW1974_SIRI1961, {
      sex: LUIS.sex,
      ageYears: LUIS.ageYears,
      population: 'ADULT',
      weightKg: LUIS.weightKg,
      skinfoldsMm: {
        triceps: sf.triceps,
        biceps: sf.biceps,
        subscapular: sf.subscapular,
        iliacCrest: sf.iliacCrest,
      },
    }),
  ).outputs;
const ffm = () => ({
  fatFreeMassKg: twoC().fatFreeMassKg,
  fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961' as const,
});
const subject = {
  sex: LUIS.sex,
  ageYears: LUIS.ageYears,
  weightKg: LUIS.weightKg,
  heightCm: LUIS.heightCm,
};

const mifflin = () => expectOk(runMethod(RMR_MIFFLIN1990, subject)).outputs.rmrKcal;
const exercise = () =>
  expectOk(
    runMethod(EE_MET_COMPENDIUM2024, {
      weightKg: LUIS.weightKg,
      activities: [{ code: '12050', met: 9.3, minutesPerSession: 30, sessionsPerWeek: 3 }],
    }),
  ).outputs;
const tee = () =>
  expectOk(
    runMethod(TEE_PAL, {
      rmrKcal: mifflin(),
      pal: 1.4,
      strategy: 'ADDITIVE',
      exerciseMode: 'NET',
      exerciseDailyNetKcal: exercise().dailyAverageNetKcal,
      ageYears: LUIS.ageYears,
    }),
  );

describe('G-11 · RN-C01 · proporcionalidad', () => {
  it('córmico 52.0; Manouvrier 92.31; acromio-ilíaco 71.25', () => {
    const heights = { heightCm: LUIS.heightCm, sittingHeightCm: LUIS.sittingHeightCm };
    expect(expectOk(runMethod(CORMIC_INDEX, heights)).outputs.index).toBeCloseTo(52.0, 2);
    expect(expectOk(runMethod(MANOUVRIER_INDEX, heights)).outputs.index).toBeCloseTo(92.31, 2);
    expect(
      expectOk(
        runMethod(ACROMIOILIAC_INDEX, {
          biiliocristalCm: LUIS.breadthsCm.biiliocristal,
          biacromialCm: LUIS.breadthsCm.biacromial,
        }),
      ).outputs.index,
    ).toBeCloseTo(71.25, 2);
  });
});

describe('G-12 · RN-E06 · peso objetivo', () => {
  it('meta de 15 % de grasa: 75.05 kg, perder 4.95 kg', () => {
    const { outputs } = expectOk(
      runMethod(TARGET_WEIGHT_FAT_PCT, { weightKg: LUIS.weightKg, ...ffm(), targetFatPct: 15 }),
    );
    expect(outputs.targetWeightKg).toBeCloseTo(75.05, 2);
    expect(outputs.weightChangeKg).toBeCloseTo(-4.95, 2);
  });
});

describe('G-13 · RN-E01 · tasa metabólica en reposo', () => {
  it('Mifflin 1759; Harris-Benedict 1853; FAO/OMS/UNU 1897; Cunningham 1903; Katch-McArdle 1748 kcal', () => {
    expectKcal(mifflin(), 1759);
    expectKcal(expectOk(runMethod(RMR_HB1919, subject)).outputs.rmrKcal, 1853);
    expectKcal(expectOk(runMethod(BMR_SCHOFIELD1985, subject)).outputs.rmrKcal, 1897);
    expectKcal(
      expectOk(runMethod(RMR_CUNNINGHAM1980, { ageYears: LUIS.ageYears, ...ffm() })).outputs
        .rmrKcal,
      1903,
    );
    expectKcal(
      expectOk(runMethod(RMR_KATCH_MCARDLE, { ageYears: LUIS.ageYears, ...ffm() })).outputs.rmrKcal,
      1748,
    );
  });
});

describe('G-14 · RN-E02 · Mifflin con PAL 1.4 (TEE_PAL)', () => {
  it('2462 kcal sin ejercicio', () => {
    const result = expectOk(
      runMethod(TEE_PAL, {
        rmrKcal: mifflin(),
        pal: 1.4,
        strategy: 'ADDITIVE',
        exerciseMode: 'NET',
        exerciseDailyNetKcal: 0,
        ageYears: LUIS.ageYears,
      }),
    );
    expectKcal(result.outputs.teeKcal, 2462);
    expect(result.methodCode).toBe('TEE_PAL');
    expect(result.inputs).toMatchObject({ strategy: 'ADDITIVE', exerciseMode: 'NET' });
  });
});

describe('G-15 · RN-E03 · correr a 9.3 MET, 30 min, 3 sesiones por semana', () => {
  it('bruto 372; neto 332 por sesión; 142 por día; GET 2605 kcal', () => {
    const { activities, dailyAverageNetKcal } = exercise();
    expectKcal(activities[0]?.grossKcalPerSession ?? 0, 372);
    expectKcal(activities[0]?.netKcalPerSession ?? 0, 332);
    expectKcal(dailyAverageNetKcal, 142);
    const result = tee();
    expectKcal(result.outputs.teeKcal, 2605);
    expect(result.methodCode).toBe('TEE_PAL');
  });
});

describe('G-16 · RN-E04 y RN-E06 · meta de −3 kg de grasa al mes', () => {
  it('déficit 770 kcal; objetivo 1835 kcal; ritmo 0.86 % semanal; 1.65 meses', () => {
    const result = tee();
    const goal = expectOk(
      runMethod(FAT_LOSS_7700, {
        teeKcal: result.outputs.teeKcal,
        weightKg: LUIS.weightKg,
        fatChangeKgPerMonth: -3,
      }),
    );
    const target = expectOk(
      runMethod(TARGET_WEIGHT_FAT_PCT, {
        weightKg: LUIS.weightKg,
        ...ffm(),
        targetFatPct: 15,
        fatChangeKgPerMonth: -3,
      }),
    ).outputs;

    expectKcal(goal.outputs.deficitKcal, 770);
    expectKcal(goal.outputs.targetKcal, 1835);
    expect(goal.outputs.weeklyRatePct).toBeCloseTo(0.86, 2);
    expect(goal.warnings).toEqual([]);
    expect(target.monthsToTarget).toBeCloseTo(1.65, 2);
  });
});

describe('G-28 · RN-E01 y RN-D06 · niño de 12 años y 40 kg', () => {
  it('Schofield banda 10–18: 1365.6 kcal; el GET con PAL lleva advertencia pediátrica', () => {
    const rmrKcal = expectOk(
      runMethod(BMR_SCHOFIELD1985, { sex: 'M', ageYears: 12, weightKg: kg(40) }),
    ).outputs.rmrKcal;
    const result = expectOk(
      runMethod(TEE_PAL, {
        rmrKcal,
        pal: 1.6,
        strategy: 'FACTORIAL',
        exerciseMode: 'NET',
        exerciseDailyNetKcal: 0,
        ageYears: 12,
      }),
    );

    expect(rmrKcal).toBeCloseTo(1365.64, 2);
    expect(result.warnings).toEqual([
      expect.objectContaining({ rule: 'RN-D06', severity: 'WARNING', code: 'NC-ENG-210' }),
    ]);
  });
});
