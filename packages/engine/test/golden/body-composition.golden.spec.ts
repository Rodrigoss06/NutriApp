import { describe, expect, it } from 'vitest';
import {
  COMP4_DEROSE_GUIMARAES,
  COMP5_KERR1988,
  FAT_DW1974_SIRI1961,
  FAT_FAULKNER1968,
  FAT_YUHASZ1974,
  MUSCLE_LEE2000,
} from '../../src/body-composition/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { mm } from '../../src/units.js';
import { LUIS } from '../fixtures/luis.js';
import { expectOk } from '../support.js';

const sf = LUIS.skinfoldsMm;
const subject = {
  sex: LUIS.sex,
  ageYears: LUIS.ageYears,
  population: 'ADULT',
  weightKg: LUIS.weightKg,
} as const;

const durninWomersley = () =>
  expectOk(
    runMethod(FAT_DW1974_SIRI1961, {
      ...subject,
      skinfoldsMm: {
        triceps: sf.triceps,
        biceps: sf.biceps,
        subscapular: sf.subscapular,
        iliacCrest: sf.iliacCrest,
      },
    }),
  );

describe('G-06 · RN-D01 · Durnin & Womersley + Siri', () => {
  it('suma 56 mm; densidad 1.05261; grasa 20.26 %; masa grasa 16.21 kg; libre de grasa 63.79 kg', () => {
    const { outputs, warnings } = durninWomersley();

    expect(outputs.sum4Mm).toBe(56);
    expect(outputs.density).toBeCloseTo(1.05261, 5);
    expect(outputs.fatPct).toBeCloseTo(20.26, 2);
    expect(outputs.fatMassKg).toBeCloseTo(16.21, 2);
    expect(outputs.fatFreeMassKg).toBeCloseTo(63.79, 2);
    expect(warnings).toEqual([]);
  });
});

describe('G-07 · RN-D03 · Faulkner y Yuhasz', () => {
  it('Faulkner 16.03 % (suma 67 mm); Yuhasz 12.57 % (suma de 6: 95 mm)', () => {
    const faulkner = expectOk(
      runMethod(FAT_FAULKNER1968, {
        ...subject,
        skinfoldsMm: {
          triceps: sf.triceps,
          subscapular: sf.subscapular,
          supraspinale: sf.supraspinale,
          abdominal: sf.abdominal,
        },
      }),
    ).outputs;
    const yuhasz = expectOk(
      runMethod(FAT_YUHASZ1974, {
        ...subject,
        skinfoldsMm: {
          triceps: sf.triceps,
          subscapular: sf.subscapular,
          supraspinale: sf.supraspinale,
          abdominal: sf.abdominal,
          frontThigh: sf.frontThigh,
          medialCalf: sf.medialCalf,
        },
      }),
    ).outputs;

    expect(faulkner.sum4Mm).toBe(67);
    expect(faulkner.fatPct).toBeCloseTo(16.03, 2);
    expect(yuhasz.sum6Mm).toBe(95);
    expect(yuhasz.fatPct).toBeCloseTo(12.57, 2);
  });
});

describe('G-08 · RN-D01 · cuatro componentes de De Rose y Guimarães', () => {
  it('hueso (Rocha) 12.02 kg; residual (Würch) 19.28 kg; músculo por diferencia 32.49 kg', () => {
    const { outputs } = expectOk(
      runMethod(COMP4_DEROSE_GUIMARAES, {
        sex: LUIS.sex,
        weightKg: LUIS.weightKg,
        heightCm: LUIS.heightCm,
        wristBreadthCm: LUIS.breadthsCm.wrist,
        femurBreadthCm: LUIS.breadthsCm.femur,
        fatMassKg: durninWomersley().outputs.fatMassKg,
        fatMethodCode: 'FAT_DW1974_SIRI1961',
      }),
    );

    expect(outputs.boneKg).toBeCloseTo(12.02, 2);
    expect(outputs.residualKg).toBeCloseTo(19.28, 2);
    expect(outputs.muscleKg).toBeCloseTo(32.49, 2);
  });
});

describe('G-09 · RN-D01 · músculo esquelético de Lee', () => {
  it('perímetro de brazo corregido 29.23 cm; músculo esquelético 32.58 kg', () => {
    const { outputs } = expectOk(
      runMethod(MUSCLE_LEE2000, {
        sex: LUIS.sex,
        ageYears: LUIS.ageYears,
        weightKg: LUIS.weightKg,
        heightCm: LUIS.heightCm,
        ethnicityCoefficient: 0,
        girthsCm: {
          armRelaxed: LUIS.girthsCm.armRelaxed,
          thigh: LUIS.girthsCm.thigh,
          calf: LUIS.girthsCm.calf,
        },
        skinfoldsMm: { triceps: sf.triceps, frontThigh: sf.frontThigh, medialCalf: sf.medialCalf },
      }),
    );

    expect(outputs.correctedArmGirthCm).toBeCloseTo(29.23, 2);
    expect(outputs.skeletalMuscleKg).toBeCloseTo(32.58, 2);
  });
});

describe('G-10 · RN-D07 · cinco componentes de Kerr', () => {
  it('superficie, cinco masas con sus Z y masa estructurada +1.98 % sin advertencia', () => {
    const { outputs, warnings } = expectOk(
      runMethod(COMP5_KERR1988, {
        sex: LUIS.sex,
        ageYears: LUIS.ageYears,
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
        girthsCm: {
          head: LUIS.girthsCm.head,
          armRelaxed: LUIS.girthsCm.armRelaxed,
          forearm: LUIS.girthsCm.forearm,
          chest: LUIS.girthsCm.chest,
          waist: LUIS.girthsCm.waist,
          thigh: LUIS.girthsCm.thigh,
          calf: LUIS.girthsCm.calf,
        },
        breadthsCm: {
          biacromial: LUIS.breadthsCm.biacromial,
          biiliocristal: LUIS.breadthsCm.biiliocristal,
          humerus: LUIS.breadthsCm.humerus,
          femur: LUIS.breadthsCm.femur,
          transverseChest: LUIS.breadthsCm.transverseChest,
          apChestDepth: LUIS.breadthsCm.apChestDepth,
        },
      }),
    );

    expect(outputs.bodySurfaceAreaM2).toBeCloseTo(1.8599, 4);
    expect(outputs.skinKg).toBeCloseTo(4.04, 2);
    expect(outputs.adiposeKg).toBeCloseTo(23.44, 2);
    expect(outputs.zAdipose).toBeCloseTo(-0.691, 3);
    expect(outputs.muscleKg).toBeCloseTo(35.92, 2);
    expect(outputs.zMuscle).toBeCloseTo(1.58, 2);
    expect(outputs.boneKg).toBeCloseTo(8.72, 2);
    // 03 v1.3: valores exactos, sin redondeo intermedio (cabeza 1.325 + cuerpo 7.397 = 8.722).
    expect(outputs.headBoneKg).toBeCloseTo(1.325, 3);
    expect(outputs.bodyBoneKg).toBeCloseTo(7.397, 3);
    expect(outputs.residualKg).toBeCloseTo(9.46, 2);
    expect(outputs.zResidual).toBeCloseTo(2.44, 2);
    expect(outputs.structuredMassKg).toBeCloseTo(81.59, 2);
    expect(outputs.structuredDiffPct).toBeCloseTo(1.98, 2);
    expect(warnings).toEqual([]);
  });
});

describe('G-26 · RN-D06 · Durnin y Womersley en un hombre de 55 años (ADR-022)', () => {
  it('densidad 1.03298; grasa 29.20 %, no 30.85 % de la errata', () => {
    const { outputs } = expectOk(
      runMethod(FAT_DW1974_SIRI1961, {
        sex: 'M',
        ageYears: 55,
        population: 'ADULT',
        weightKg: LUIS.weightKg,
        skinfoldsMm: { triceps: mm(15), biceps: mm(10), subscapular: mm(15), iliacCrest: mm(20) },
      }),
    );

    expect(outputs.sum4Mm).toBe(60);
    expect(outputs.density).toBeCloseTo(1.03298, 5);
    expect(outputs.fatPct).toBeCloseTo(29.2, 2);
    expect(outputs.fatPct).not.toBeCloseTo(30.85, 1);
  });
});

describe('G-27 · RN-D06 · Durnin y Womersley en una mujer de 17 años', () => {
  it('banda 16–19: densidad 1.04281; grasa 24.68 %, con advertencia de Siri', () => {
    const { outputs, warnings } = expectOk(
      runMethod(FAT_DW1974_SIRI1961, {
        sex: 'F',
        ageYears: 17,
        population: 'ADOLESCENT',
        weightKg: LUIS.weightKg,
        skinfoldsMm: { triceps: mm(12), biceps: mm(8), subscapular: mm(10), iliacCrest: mm(15) },
      }),
    );

    expect(outputs.sum4Mm).toBe(45);
    expect(outputs.density).toBeCloseTo(1.04281, 5);
    expect(outputs.fatPct).toBeCloseTo(24.68, 2);
    expect(warnings).toEqual([
      expect.objectContaining({ rule: 'RN-D06', severity: 'WARNING', code: 'NC-ENG-102' }),
    ]);
  });
});
