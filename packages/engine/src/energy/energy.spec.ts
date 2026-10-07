import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import type { Sex } from '../registry/types.js';
import { cm, kg } from '../units.js';
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
} from './index.js';

const codes = (run: ReturnType<typeof runMethod>) =>
  run.ok ? run.result.warnings.map((w) => w.code) : ['no calculó'];
const person = (sex: Sex, ageYears: number) => ({
  sex,
  ageYears,
  weightKg: kg(70),
  heightCm: cm(170),
});

describe('RN-E01 y RN-D06 · validez de las ecuaciones de TMR', () => {
  it('Mifflin advierte fuera de 19 a 78 años; las mujeres restan 161', () => {
    expect(codes(runMethod(RMR_MIFFLIN1990, person('M', 19)))).toEqual([]);
    expect(codes(runMethod(RMR_MIFFLIN1990, person('M', 18)))).toEqual(['NC-ENG-201']);
    expect(codes(runMethod(RMR_MIFFLIN1990, person('F', 79)))).toEqual(['NC-ENG-201']);
    const men = expectOk(runMethod(RMR_MIFFLIN1990, person('M', 30))).outputs.rmrKcal;
    const women = expectOk(runMethod(RMR_MIFFLIN1990, person('F', 30))).outputs.rmrKcal;
    expect(men - women).toBeCloseTo(166, 10);
  });

  it('Harris-Benedict advierte en menores de 18, hombres mayores de 63 y mujeres mayores de 74', () => {
    expect(codes(runMethod(RMR_HB1919, person('M', 17)))).toEqual(['NC-ENG-202']);
    expect(codes(runMethod(RMR_HB1919, person('M', 64)))).toEqual(['NC-ENG-202']);
    expect(codes(runMethod(RMR_HB1919, person('F', 70)))).toEqual([]);
    expect(codes(runMethod(RMR_HB1919, person('F', 75)))).toEqual(['NC-ENG-202']);
    expect(expectOk(runMethod(RMR_HB1919, person('F', 30))).outputs.rmrKcal).toBeCloseTo(
      655.0955 + 9.5634 * 70 + 1.8496 * 170 - 4.6756 * 30,
      10,
    );
  });

  it.each([
    ['M', 1, 59.512 * 10 - 30.4],
    ['M', 3, 22.706 * 10 + 504.3],
    ['M', 18, 15.057 * 10 + 692.2],
    ['M', 30, 11.472 * 10 + 873.1],
    ['M', 60, 11.711 * 10 + 587.7],
    ['F', 2.9, 58.317 * 10 - 31.1],
    ['F', 9.9, 20.315 * 10 + 485.9],
    ['F', 10, 13.384 * 10 + 692.6],
    ['F', 29.9, 14.818 * 10 + 486.6],
    ['F', 59, 8.126 * 10 + 845.6],
    ['F', 80, 9.082 * 10 + 658.5],
  ] as const)('Schofield %s de %s años usa su banda', (sex, ageYears, expected) => {
    const run = runMethod(BMR_SCHOFIELD1985, { sex, ageYears, weightKg: kg(10) });
    expect(expectOk(run).outputs.rmrKcal).toBeCloseTo(expected, 10);
    expect(codes(run)).toEqual([]);
  });

  it.each([RMR_CUNNINGHAM1980, RMR_KATCH_MCARDLE])(
    '%s: ERROR sin masa libre de grasa de una evaluación; advertencia en menores de 18',
    (method) => {
      expect(expectErrors(runMethod(method, { ageYears: 30 }))).toEqual([
        { rule: 'RN-D06', code: 'NC-ENG-203', severity: 'ERROR' },
      ]);
      expect(
        codes(
          runMethod(method, {
            ageYears: 17,
            fatFreeMassKg: kg(50),
            fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961',
          }),
        ),
      ).toEqual(['NC-ENG-204']);
    },
  );
});

describe('RN-E02 · gasto total (TEE_PAL)', () => {
  const base = {
    rmrKcal: 1700,
    exerciseMode: 'NET',
    exerciseDailyNetKcal: 150,
    ageYears: 30,
  } as const;

  it('aditiva suma el ejercicio neto; factorial no lo suma', () => {
    const additive = runMethod(TEE_PAL, { ...base, pal: 1.5, strategy: 'ADDITIVE' });
    const factorial = runMethod(TEE_PAL, { ...base, pal: 1.5, strategy: 'FACTORIAL' });
    expect(additive.ok && additive.result.outputs.teeKcal).toBeCloseTo(1700 * 1.5 + 150, 10);
    expect(factorial.ok && factorial.result.outputs).toEqual({
      baseKcal: 1700 * 1.5,
      exerciseKcal: 0,
      teeKcal: 1700 * 1.5,
    });
  });

  it.each([1.39, 2.41])('ERROR con PAL %s: debe estar entre 1.40 y 2.40', (pal) => {
    const result = runMethod(TEE_PAL, { ...base, pal, strategy: 'ADDITIVE' });
    expect(!result.ok && result.errors.map((e) => [e.rule, e.code])).toEqual([
      ['RN-E02', 'NC-ENG-211'],
    ]);
  });

  it('RN-D06 · aviso pediátrico en menores de 18, sin dejar de calcular', () => {
    const result = runMethod(TEE_PAL, { ...base, ageYears: 17, pal: 1.5, strategy: 'ADDITIVE' });
    expect(result.ok && result.result.warnings.map((w) => w.code)).toEqual(['NC-ENG-210']);
  });
});

describe('RN-E03 · ejercicio por METs', () => {
  it('suma varias actividades y promedia por 7 días', () => {
    const { outputs } = expectOk(
      runMethod(EE_MET_COMPENDIUM2024, {
        weightKg: kg(60),
        activities: [
          { met: 5, minutesPerSession: 60, sessionsPerWeek: 2 },
          { met: 3, minutesPerSession: 30, sessionsPerWeek: 7 },
        ],
      }),
    );
    expect(outputs.weeklyNetKcal).toBeCloseTo(4 * 60 * 2 + 2 * 60 * 0.5 * 7, 10);
    expect(outputs.dailyAverageNetKcal).toBeCloseTo(outputs.weeklyNetKcal / 7, 10);
  });

  it('rechaza un MET menor que 1: el neto saldría negativo', () => {
    expect(
      expectErrors(
        runMethod(EE_MET_COMPENDIUM2024, {
          weightKg: kg(60),
          activities: [{ met: 0.9, minutesPerSession: 30, sessionsPerWeek: 1 }],
        }),
      ),
    ).toEqual([{ rule: 'RN-E03', code: 'NC-ENG-205', severity: 'ERROR' }]);
  });
});

describe('RN-E04 y RN-E05 · objetivo por grasa al mes', () => {
  const goal = (fatChangeKgPerMonth: number) =>
    runMethod(FAT_LOSS_7700, { teeKcal: 2500, weightKg: kg(80), fatChangeKgPerMonth });

  it('una ganancia suma superávit', () => {
    const { outputs } = expectOk(goal(1.5));
    expect(outputs.deficitKcal).toBeCloseTo(-385, 10);
    expect(outputs.targetKcal).toBeCloseTo(2885, 10);
    expect(outputs.projection).toBe('INITIAL_ESTIMATE');
  });

  it.each([
    [-1.5, ['NC-ENG-206']],
    [-1.8, []],
    [-3.4, []],
    [-3.6, ['NC-ENG-206']],
    [0.9, []],
    [0.7, ['NC-ENG-207']],
    [1.8, ['NC-ENG-207']],
  ])('%s kg al mes: advertencias %j', (change, expected) => {
    expect(codes(goal(change))).toEqual(expected);
  });
});

describe('RN-E06 · peso objetivo', () => {
  it('rechaza un % de grasa objetivo fuera de 0 a 100', () => {
    const run = runMethod(TARGET_WEIGHT_FAT_PCT, {
      weightKg: kg(80),
      fatFreeMassKg: kg(64),
      fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961',
      targetFatPct: 100,
    });
    expect(expectErrors(run)).toEqual([{ rule: 'RN-E06', code: 'NC-ENG-208', severity: 'ERROR' }]);
  });

  it('sin ritmo mensual no estima tiempo; con un ritmo que va en contra tampoco', () => {
    const input = {
      weightKg: kg(80),
      fatFreeMassKg: kg(64),
      fatFreeMassMethodCode: 'FAT_DW1974_SIRI1961',
      targetFatPct: 15,
    } as const;
    expect(expectOk(runMethod(TARGET_WEIGHT_FAT_PCT, input)).outputs.monthsToTarget).toBeNull();
    expect(
      expectOk(runMethod(TARGET_WEIGHT_FAT_PCT, { ...input, fatChangeKgPerMonth: 1 })).outputs
        .monthsToTarget,
    ).toBeNull();
  });
});
