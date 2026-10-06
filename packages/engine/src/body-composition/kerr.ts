import { correctedGirthCm } from '../anthropometry/indicators.js';
import { defineMethod } from '../registry/run-method.js';
import type { Sex } from '../registry/types.js';
import { SITES } from '../sites.js';
import { sum } from '../stats.js';
import type { Cm, Kg, Mm } from '../units.js';

/** Phantom unisex de referencia (Ross y Wilson 1974). */
export const PHANTOM_HEIGHT_CM = 170.18;
export const PHANTOM_SITTING_HEIGHT_CM = 89.92;

/** Diferencia aceptada entre la masa estructurada y el peso (RN-D07). */
export const STRUCTURED_MASS_TOLERANCE_PCT = 5;

/** Escala la medida a la talla del Phantom y la expresa como puntuación Z. */
export const phantomZ = (
  value: number,
  heightCm: number,
  p: number,
  s: number,
  referenceHeightCm = PHANTOM_HEIGHT_CM,
): number => (value * (referenceHeightCm / heightCm) - p) / s;

/** Lleva una Z de vuelta a la masa real para la talla del sujeto (las masas escalan al cubo). */
export const massFromZ = (
  z: number,
  phantomMassKg: number,
  phantomSdKg: number,
  heightCm: number,
  referenceHeightCm = PHANTOM_HEIGHT_CM,
): number => (z * phantomSdKg + phantomMassKg) / (referenceHeightCm / heightCm) ** 3;

export interface KerrInput {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly weightKg: Kg;
  readonly heightCm: Cm;
  readonly sittingHeightCm: Cm;
  readonly skinfoldsMm: {
    readonly triceps: Mm;
    readonly subscapular: Mm;
    readonly supraspinale: Mm;
    readonly abdominal: Mm;
    readonly frontThigh: Mm;
    readonly medialCalf: Mm;
  };
  readonly girthsCm: {
    readonly head: Cm;
    readonly armRelaxed: Cm;
    readonly forearm: Cm;
    readonly chest: Cm;
    readonly waist: Cm;
    readonly thigh: Cm;
    readonly calf: Cm;
  };
  readonly breadthsCm: {
    readonly biacromial: Cm;
    readonly biiliocristal: Cm;
    readonly humerus: Cm;
    readonly femur: Cm;
    readonly transverseChest: Cm;
    readonly apChestDepth: Cm;
  };
}

export interface KerrOutput {
  readonly bodySurfaceAreaM2: number;
  readonly skinKg: Kg;
  readonly adiposeKg: Kg;
  readonly muscleKg: Kg;
  readonly headBoneKg: Kg;
  readonly bodyBoneKg: Kg;
  readonly boneKg: Kg;
  readonly residualKg: Kg;
  readonly zAdipose: number;
  readonly zMuscle: number;
  readonly zBone: number;
  readonly zResidual: number;
  readonly structuredMassKg: Kg;
  /** (masa estructurada − peso) ÷ peso × 100. */
  readonly structuredDiffPct: number;
}

/** Constante de superficie corporal: menores de 12 años 70.691; hombres 68.308; mujeres 73.704. */
const surfaceConstant = (sex: Sex, ageYears: number): number =>
  ageYears < 12 ? 70.691 : sex === 'M' ? 68.308 : 73.704;

/** Kerr (1988): piel, tejido adiposo, músculo, hueso y residual con la estrategia Phantom. */
export const COMP5_KERR1988 = defineMethod<KerrInput, KerrOutput>({
  code: 'COMP5_KERR1988',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ATHLETE'],
  requiredInputs: [
    'sex',
    'ageYears',
    'weightKg',
    'heightCm',
    'sittingHeightCm',
    'skinfoldsMm',
    'girthsCm',
    'breadthsCm',
  ],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.BASIC_HEIGHT,
    SITES.BASIC_SITTING_HEIGHT,
    SITES.SKF_TRICEPS,
    SITES.SKF_SUBSCAPULAR,
    SITES.SKF_SUPRASPINALE,
    SITES.SKF_ABDOMINAL,
    SITES.SKF_FRONT_THIGH,
    SITES.SKF_MEDIAL_CALF,
    SITES.GIRTH_HEAD,
    SITES.GIRTH_ARM_RELAXED,
    SITES.GIRTH_FOREARM,
    SITES.GIRTH_CHEST,
    SITES.GIRTH_WAIST,
    SITES.GIRTH_THIGH,
    SITES.GIRTH_CALF,
    SITES.BREADTH_BIACROMIAL,
    SITES.BREADTH_BIILIOCRISTAL,
    SITES.BREADTH_HUMERUS,
    SITES.BREADTH_FEMUR,
    SITES.BREADTH_TRANSVERSE_CHEST,
    SITES.BREADTH_AP_CHEST,
  ],
  citation:
    'Kerr DA. An anthropometric method for fractionation of skin, adipose, bone, muscle and residual tissue masses, 1988; Ross WD, Kerr DA 1991',
  validity: [],
  measurements: ({ weightKg, heightCm, skinfoldsMm }) => [
    { field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg },
    { field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm },
    ...Object.entries(skinfoldsMm).map(
      ([site, value]) => ({ field: `skinfoldsMm.${site}`, kind: 'SKINFOLD_MM', value }) as const,
    ),
  ],
  compute: ({
    sex,
    ageYears,
    weightKg,
    heightCm,
    sittingHeightCm,
    skinfoldsMm: sf,
    girthsCm: g,
    breadthsCm: b,
  }) => {
    // Piel: superficie corporal (m²) × grosor (mm) × densidad 1.05.
    const bodySurfaceAreaM2 =
      (surfaceConstant(sex, ageYears) * weightKg ** 0.425 * heightCm ** 0.725) / 10000;
    const skinKg = bodySurfaceAreaM2 * (sex === 'M' ? 2.07 : 1.96) * 1.05;

    const zAdipose = phantomZ(sum(Object.values(sf)), heightCm, 116.41, 34.79);
    const adiposeKg = massFromZ(zAdipose, 25.6, 5.85, heightCm);

    const muscleGirthsCm =
      correctedGirthCm(g.armRelaxed, sf.triceps) +
      g.forearm +
      correctedGirthCm(g.chest, sf.subscapular) +
      correctedGirthCm(g.thigh, sf.frontThigh) +
      correctedGirthCm(g.calf, sf.medialCalf);
    const zMuscle = phantomZ(muscleGirthsCm, heightCm, 207.21, 13.74);
    const muscleKg = massFromZ(zMuscle, 24.5, 5.4, heightCm);

    // Hueso: la cabeza no se escala por talla.
    const headBoneKg = ((g.head - 56.0) / 1.44) * 0.18 + 1.2;
    const zBone = phantomZ(
      b.biacromial + b.biiliocristal + 2 * b.humerus + 2 * b.femur,
      heightCm,
      98.88,
      5.33,
    );
    const bodyBoneKg = massFromZ(zBone, 6.7, 1.34, heightCm);

    // Residual: se escala por la talla sentado del Phantom.
    const residualSumCm =
      b.transverseChest + b.apChestDepth + correctedGirthCm(g.waist, sf.abdominal);
    const zResidual = phantomZ(
      residualSumCm,
      sittingHeightCm,
      109.35,
      7.08,
      PHANTOM_SITTING_HEIGHT_CM,
    );
    const residualKg = massFromZ(zResidual, 6.1, 1.24, sittingHeightCm, PHANTOM_SITTING_HEIGHT_CM);

    const boneKg = headBoneKg + bodyBoneKg;
    const structuredMassKg = skinKg + adiposeKg + muscleKg + boneKg + residualKg;
    const structuredDiffPct = ((structuredMassKg - weightKg) / weightKg) * 100;

    return {
      outputs: {
        bodySurfaceAreaM2,
        skinKg: skinKg as Kg,
        adiposeKg: adiposeKg as Kg,
        muscleKg: muscleKg as Kg,
        headBoneKg: headBoneKg as Kg,
        bodyBoneKg: bodyBoneKg as Kg,
        boneKg: boneKg as Kg,
        residualKg: residualKg as Kg,
        zAdipose,
        zMuscle,
        zBone,
        zResidual,
        structuredMassKg: structuredMassKg as Kg,
        structuredDiffPct,
      },
      issues:
        Math.abs(structuredDiffPct) > STRUCTURED_MASS_TOLERANCE_PCT
          ? [
              {
                rule: 'RN-D07',
                severity: 'WARNING',
                code: 'NC-ENG-110',
                message: 'Revisar medidas: la masa estructurada difiere del peso en más de 5 %.',
              },
            ]
          : [],
    };
  },
});
