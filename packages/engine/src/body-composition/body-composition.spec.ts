import { describe, expect, it } from 'vitest';
import { LUIS } from '../../test/fixtures/luis.js';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import type { Population, Sex } from '../registry/types.js';
import { cm, kg, mm } from '../units.js';
import {
  BONE_ROCHA1975,
  COMP4_DEROSE_GUIMARAES,
  COMP5_KERR1988,
  FAT_DW1974_SIRI1961,
  FAT_FAULKNER1968,
  FAT_JP1978_7,
  FAT_YUHASZ1974,
  MUSCLE_LEE2000,
  RESIDUAL_WURCH1974,
  type KerrInput,
} from './index.js';

const sf = LUIS.skinfoldsMm;

const dw = (sex: Sex, ageYears: number) =>
  runMethod(FAT_DW1974_SIRI1961, {
    sex,
    ageYears,
    population: 'ADULT',
    weightKg: LUIS.weightKg,
    skinfoldsMm: {
      triceps: sf.triceps,
      biceps: sf.biceps,
      subscapular: sf.subscapular,
      iliacCrest: sf.iliacCrest,
    },
  });

const warningCodes = (run: ReturnType<typeof runMethod>) =>
  run.ok ? run.result.warnings.map((warning) => warning.code) : ['no calculó'];

describe('RN-D06 · Durnin y Womersley + Siri: bandas de edad del artículo original', () => {
  it.each([
    ['M', 17],
    ['M', 72],
    ['M', 72.9],
    ['F', 16],
    ['F', 68.5],
  ] as const)('calcula para %s de %s años', (sex, age) => {
    expect(dw(sex, age).ok).toBe(true);
  });

  it.each([
    ['M', 16.9],
    ['M', 73],
    ['F', 15.9],
    ['F', 69],
  ] as const)('ERROR para %s de %s años: no hay coeficientes', (sex, age) => {
    expect(expectErrors(dw(sex, age))).toEqual([
      { rule: 'RN-D06', code: 'NC-ENG-101', severity: 'ERROR' },
    ]);
  });

  it('las bandas se toman por años cumplidos: 19.8 años usa la banda 17–19', () => {
    const at19 = expectOk(dw('M', 19)).outputs.density;
    expect(expectOk(dw('M', 19.8)).outputs.density).toBe(at19);
    expect(expectOk(dw('M', 20)).outputs.density).not.toBe(at19);
  });

  it('advierte de Siri solo en menores de 18', () => {
    expect(warningCodes(dw('M', 17.5))).toEqual(['NC-ENG-102']);
    expect(warningCodes(dw('M', 18))).toEqual([]);
  });

  it('RN-C04 · rechaza un pliegue fuera de rango', () => {
    const run = runMethod(FAT_DW1974_SIRI1961, {
      sex: 'M',
      ageYears: 28,
      population: 'ADULT',
      weightKg: LUIS.weightKg,
      skinfoldsMm: {
        triceps: mm(120),
        biceps: sf.biceps,
        subscapular: sf.subscapular,
        iliacCrest: sf.iliacCrest,
      },
    });
    expect(expectErrors(run)).toEqual([{ rule: 'RN-C04', code: 'NC-ENG-001', severity: 'ERROR' }]);
  });
});

describe('RN-D04 y RN-D06 · Jackson & Pollock de 7 pliegues', () => {
  const jp = (sex: Sex, ageYears: number, population: Population) =>
    runMethod(FAT_JP1978_7, {
      sex,
      ageYears,
      population,
      weightKg: LUIS.weightKg,
      skinfoldsMm: {
        chest: mm(10),
        midaxillary: mm(12),
        triceps: sf.triceps,
        subscapular: sf.subscapular,
        abdominal: sf.abdominal,
        suprailiac: mm(18),
        frontThigh: sf.frontThigh,
      },
    });

  it('pide los tres sitios extra de su protocolo', () => {
    expect(FAT_JP1978_7.requiredSites).toEqual(
      expect.arrayContaining(['SKF_CHEST', 'SKF_MIDAXILLARY', 'SKF_SUPRAILIAC', 'SKF_FRONT_THIGH']),
    );
  });

  it('calcula con la ecuación de cada sexo', () => {
    // Σ7 = 111 mm. Hombres: 1.112 − 0.00043499Σ + 0.00000055Σ² − 0.00028826·edad.
    const sum = 111;
    const men = 1.112 - 0.00043499 * sum + 0.00000055 * sum ** 2 - 0.00028826 * 28;
    const women = 1.097 - 0.00046971 * sum + 0.00000056 * sum ** 2 - 0.00012828 * 28;
    expect(expectOk(jp('M', 28, 'ADULT')).outputs.density).toBeCloseTo(men, 10);
    expect(expectOk(jp('F', 28, 'ADULT')).outputs.density).toBeCloseTo(women, 10);
  });

  it.each([
    ['M', 18, 'ADULT', []],
    ['M', 61, 'ADULT', []],
    ['M', 62, 'ADULT', ['NC-ENG-103']],
    ['F', 56, 'ADULT', ['NC-ENG-103']],
    ['M', 17, 'ADOLESCENT', ['NC-ENG-103']],
    ['M', 30, 'ATHLETE', ['NC-ENG-103']],
  ] as const)('%s de %s años (%s): advertencias %j', (sex, age, population, codes) => {
    expect(warningCodes(jp(sex, age, population))).toEqual(codes);
  });
});

describe('RN-D06 · Faulkner y Yuhasz', () => {
  const faulkner = (sex: Sex, population: Population) =>
    runMethod(FAT_FAULKNER1968, {
      sex,
      ageYears: 25,
      population,
      weightKg: LUIS.weightKg,
      skinfoldsMm: {
        triceps: sf.triceps,
        subscapular: sf.subscapular,
        supraspinale: sf.supraspinale,
        abdominal: sf.abdominal,
      },
    });
  const yuhasz = (sex: Sex, population: Population) =>
    runMethod(FAT_YUHASZ1974, {
      sex,
      ageYears: 25,
      population,
      weightKg: LUIS.weightKg,
      skinfoldsMm: {
        triceps: sf.triceps,
        subscapular: sf.subscapular,
        supraspinale: sf.supraspinale,
        abdominal: sf.abdominal,
        frontThigh: sf.frontThigh,
        medialCalf: sf.medialCalf,
      },
    });

  it('Faulkner advierte si es mujer o si no es deportista', () => {
    expect(warningCodes(faulkner('M', 'ATHLETE'))).toEqual([]);
    expect(warningCodes(faulkner('F', 'ATHLETE'))).toEqual(['NC-ENG-104']);
    expect(warningCodes(faulkner('M', 'ADULT'))).toEqual(['NC-ENG-104']);
  });

  it('Yuhasz advierte si no es deportista y usa la ecuación de cada sexo', () => {
    expect(warningCodes(yuhasz('F', 'ATHLETE'))).toEqual([]);
    expect(warningCodes(yuhasz('M', 'ADULT'))).toEqual(['NC-ENG-105']);
    expect(expectOk(yuhasz('F', 'ATHLETE')).outputs.fatPct).toBeCloseTo(0.1548 * 95 + 3.58, 10);
  });
});

describe('RN-D06 y RN-D11 · Lee (2000)', () => {
  const lee = (overrides: {
    ageYears?: number;
    weightKg?: number;
    ethnicityCoefficient?: number;
  }) =>
    runMethod(MUSCLE_LEE2000, {
      sex: 'F',
      ageYears: overrides.ageYears ?? 30,
      weightKg: kg(overrides.weightKg ?? 60),
      heightCm: cm(165),
      ethnicityCoefficient: (overrides.ethnicityCoefficient ?? -2) as 0,
      girthsCm: { armRelaxed: cm(28), thigh: cm(52), calf: cm(35) },
      skinfoldsMm: { triceps: mm(15), frontThigh: mm(20), medialCalf: mm(12) },
    });

  it('usa el coeficiente que llega, sin valor por defecto', () => {
    const asian = expectOk(lee({ ethnicityCoefficient: -2 })).outputs.skeletalMuscleKg;
    const black = expectOk(lee({ ethnicityCoefficient: 1.1 })).outputs.skeletalMuscleKg;
    expect(black - asian).toBeCloseTo(3.1, 10);
  });

  it.each([undefined, 0.5])('ERROR con el coeficiente %s: solo 0, −2.0 o +1.1', (coefficient) => {
    const run = runMethod(MUSCLE_LEE2000, {
      ...{
        sex: 'F' as const,
        ageYears: 30,
        weightKg: kg(60),
        heightCm: cm(165),
        girthsCm: { armRelaxed: cm(28), thigh: cm(52), calf: cm(35) },
        skinfoldsMm: { triceps: mm(15), frontThigh: mm(20), medialCalf: mm(12) },
      },
      ethnicityCoefficient: coefficient as 0,
    });
    expect(expectErrors(run)).toEqual([{ rule: 'RN-D11', code: 'NC-ENG-107', severity: 'ERROR' }]);
  });

  it('advierte fuera de 20 a 81 años o con IMC de 30 o más', () => {
    expect(warningCodes(lee({ ageYears: 20 }))).toEqual([]);
    expect(warningCodes(lee({ ageYears: 19 }))).toEqual(['NC-ENG-106']);
    expect(warningCodes(lee({ ageYears: 82 }))).toEqual(['NC-ENG-106']);
    expect(warningCodes(lee({ weightKg: 82 }))).toEqual(['NC-ENG-106']);
  });
});

describe('RN-D06 · Rocha y Würch solo informan su origen', () => {
  it('declaran validez INFO y calculan sin advertencias', () => {
    expect(BONE_ROCHA1975.validity.map((rule) => rule.severity)).toEqual(['INFO']);
    expect(RESIDUAL_WURCH1974.validity.map((rule) => rule.severity)).toEqual(['INFO']);
    const bone = expectOk(
      runMethod(BONE_ROCHA1975, {
        heightCm: LUIS.heightCm,
        wristBreadthCm: cm(5.8),
        femurBreadthCm: cm(9.8),
      }),
    );
    const residualWomen = expectOk(runMethod(RESIDUAL_WURCH1974, { sex: 'F', weightKg: kg(60) }));
    expect(bone.outputs.boneKg).toBeCloseTo(12.02, 2);
    expect(bone.warnings).toEqual([]);
    expect(residualWomen.outputs.residualKg).toBeCloseTo(60 * 0.209, 10);
  });

  it('cuatro componentes guarda el método de grasa que usó', () => {
    const { inputs } = expectOk(
      runMethod(COMP4_DEROSE_GUIMARAES, {
        sex: 'M',
        weightKg: LUIS.weightKg,
        heightCm: LUIS.heightCm,
        wristBreadthCm: cm(5.8),
        femurBreadthCm: cm(9.8),
        fatMassKg: kg(16.2),
        fatMethodCode: 'FAT_YUHASZ1974',
      }),
    );
    expect(inputs.fatMethodCode).toBe('FAT_YUHASZ1974');
  });
});

describe('RN-D06 y RN-D07 · Kerr', () => {
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
    girthsCm: { ...LUIS.girthsCm },
    breadthsCm: { ...LUIS.breadthsCm },
  };

  it('en menores de 12 años usa la constante de superficie corporal 70.691', () => {
    const adult = expectOk(runMethod(COMP5_KERR1988, kerrInput)).outputs.bodySurfaceAreaM2;
    const child = expectOk(runMethod(COMP5_KERR1988, { ...kerrInput, ageYears: 11 })).outputs
      .bodySurfaceAreaM2;
    expect(child / adult).toBeCloseTo(70.691 / 68.308, 10);
  });

  it('las mujeres usan su constante y su grosor de piel', () => {
    const women = expectOk(runMethod(COMP5_KERR1988, { ...kerrInput, sex: 'F' })).outputs;
    expect(women.skinKg).toBeCloseTo(women.bodySurfaceAreaM2 * 1.96 * 1.05, 10);
  });

  it('advierte «revisar medidas» si la masa estructurada difiere del peso en más de 5 %', () => {
    const run = runMethod(COMP5_KERR1988, { ...kerrInput, weightKg: kg(70) });
    expect(warningCodes(run)).toEqual(['NC-ENG-110']);
    expect(run.ok && run.result.warnings[0]?.rule).toBe('RN-D07');
  });
});
