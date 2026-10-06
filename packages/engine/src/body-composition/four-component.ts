import { correctedGirthCm } from '../anthropometry/indicators.js';
import { defineMethod } from '../registry/run-method.js';
import type { MethodCode, Sex } from '../registry/types.js';
import { SITES } from '../sites.js';
import { cmToM, type Cm, type Kg, type Mm } from '../units.js';

const ROCHA_INFO = {
  severity: 'INFO',
  code: 'NC-ENG-108',
  message: 'Rocha modifica la fórmula de Von Döbeln en población brasileña adulta.',
} as const;

const WURCH_INFO = {
  severity: 'INFO',
  code: 'NC-ENG-109',
  message:
    'Würch usa porcentajes fijos del peso en adultos: 24.1 % en hombres y 20.9 % en mujeres.',
} as const;

/** Rocha (1975): 3.02 × (talla² × Ø muñeca × Ø fémur × 400)^0.712, todo en metros. */
export function boneMassRochaKg(heightCm: Cm, wristBreadthCm: Cm, femurBreadthCm: Cm): Kg {
  const product = cmToM(heightCm) ** 2 * cmToM(wristBreadthCm) * cmToM(femurBreadthCm) * 400;
  return (3.02 * product ** 0.712) as Kg;
}

/** Würch (1974): % fijo del peso según sexo. */
export const residualMassWurchKg = (sex: Sex, weightKg: Kg): Kg =>
  (weightKg * (sex === 'M' ? 0.241 : 0.209)) as Kg;

export interface RochaInput {
  readonly heightCm: Cm;
  readonly wristBreadthCm: Cm;
  readonly femurBreadthCm: Cm;
}

export const BONE_ROCHA1975 = defineMethod<RochaInput, { readonly boneKg: Kg }>({
  code: 'BONE_ROCHA1975',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT', 'OLDER_ADULT', 'ATHLETE'],
  requiredInputs: ['heightCm', 'wristBreadthCm', 'femurBreadthCm'],
  requiredSites: [SITES.BASIC_HEIGHT, SITES.BREADTH_WRIST, SITES.BREADTH_FEMUR],
  citation: 'Rocha MSL. Arq Anat Antropol 1975;1:445-51 (modificación de Von Döbeln)',
  validity: [ROCHA_INFO],
  measurements: ({ heightCm }) => [{ field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm }],
  compute: ({ heightCm, wristBreadthCm, femurBreadthCm }) => ({
    outputs: { boneKg: boneMassRochaKg(heightCm, wristBreadthCm, femurBreadthCm) },
  }),
});

export interface WurchInput {
  readonly sex: Sex;
  readonly weightKg: Kg;
}

export const RESIDUAL_WURCH1974 = defineMethod<WurchInput, { readonly residualKg: Kg }>({
  code: 'RESIDUAL_WURCH1974',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT', 'OLDER_ADULT', 'ATHLETE'],
  requiredInputs: ['sex', 'weightKg'],
  requiredSites: [SITES.BASIC_WEIGHT],
  citation: 'Würch A. Medicine du Sport 1974;48:32-7',
  validity: [WURCH_INFO],
  measurements: ({ weightKg }) => [{ field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg }],
  compute: ({ sex, weightKg }) => ({ outputs: { residualKg: residualMassWurchKg(sex, weightKg) } }),
});

export interface FourComponentInput extends RochaInput, WurchInput {
  /** Masa grasa de un resultado de dos componentes; su método queda citado en los insumos. */
  readonly fatMassKg: Kg;
  readonly fatMethodCode: MethodCode;
}

export interface FourComponentOutput {
  readonly fatMassKg: Kg;
  readonly boneKg: Kg;
  readonly residualKg: Kg;
  readonly muscleKg: Kg;
}

/** De Rose y Guimarães: grasa elegida, hueso por Rocha, residual por Würch y músculo por diferencia. */
export const COMP4_DEROSE_GUIMARAES = defineMethod<FourComponentInput, FourComponentOutput>({
  code: 'COMP4_DEROSE_GUIMARAES',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT', 'OLDER_ADULT', 'ATHLETE'],
  requiredInputs: [
    'sex',
    'weightKg',
    'heightCm',
    'wristBreadthCm',
    'femurBreadthCm',
    'fatMassKg',
    'fatMethodCode',
  ],
  requiredSites: [SITES.BASIC_WEIGHT, SITES.BASIC_HEIGHT, SITES.BREADTH_WRIST, SITES.BREADTH_FEMUR],
  citation:
    'De Rose EH, Guimarães ACA 1980; Rocha 1975; Würch 1974; músculo por diferencia (Matiegka 1921)',
  validity: [ROCHA_INFO, WURCH_INFO],
  measurements: ({ weightKg, heightCm }) => [
    { field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg },
    { field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm },
  ],
  compute: ({ sex, weightKg, heightCm, wristBreadthCm, femurBreadthCm, fatMassKg }) => {
    const boneKg = boneMassRochaKg(heightCm, wristBreadthCm, femurBreadthCm);
    const residualKg = residualMassWurchKg(sex, weightKg);
    const muscleKg = (weightKg - (fatMassKg + boneKg + residualKg)) as Kg;
    return { outputs: { fatMassKg, boneKg, residualKg, muscleKg } };
  },
});

/** Coeficientes de grupo de referencia de Lee (RN-D11): blanco o hispano, asiático, afroamericano. */
export const LEE_ETHNICITY_COEFFICIENTS = [0, -2, 1.1] as const;
export type LeeEthnicityCoefficient = (typeof LEE_ETHNICITY_COEFFICIENTS)[number];

export interface LeeInput {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly weightKg: Kg;
  readonly heightCm: Cm;
  /** Sin valor por defecto: lo fija la organización y queda en los insumos (RN-D11). */
  readonly ethnicityCoefficient: LeeEthnicityCoefficient;
  readonly girthsCm: { readonly armRelaxed: Cm; readonly thigh: Cm; readonly calf: Cm };
  readonly skinfoldsMm: { readonly triceps: Mm; readonly frontThigh: Mm; readonly medialCalf: Mm };
}

export interface LeeOutput {
  readonly skeletalMuscleKg: Kg;
  readonly correctedArmGirthCm: Cm;
  readonly correctedThighGirthCm: Cm;
  readonly correctedCalfGirthCm: Cm;
}

const bmiOf = (weightKg: Kg, heightCm: Cm): number => weightKg / cmToM(heightCm) ** 2;

/** Lee et al. (2000): músculo esquelético con perímetros corregidos. */
export const MUSCLE_LEE2000 = defineMethod<LeeInput, LeeOutput>({
  code: 'MUSCLE_LEE2000',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT', 'OLDER_ADULT'],
  requiredInputs: [
    'sex',
    'ageYears',
    'weightKg',
    'heightCm',
    'ethnicityCoefficient',
    'girthsCm',
    'skinfoldsMm',
  ],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.BASIC_HEIGHT,
    SITES.GIRTH_ARM_RELAXED,
    SITES.GIRTH_THIGH,
    SITES.GIRTH_CALF,
    SITES.SKF_TRICEPS,
    SITES.SKF_FRONT_THIGH,
    SITES.SKF_MEDIAL_CALF,
  ],
  citation: 'Lee RC, Wang Z, Heo M, et al. Am J Clin Nutr 2000;72:796-803',
  validity: [
    {
      rule: 'RN-D11',
      severity: 'ERROR',
      code: 'NC-ENG-107',
      message:
        'Lee exige el coeficiente de grupo de referencia (0, −2.0 o +1.1) fijado por la organización.',
      when: ({ ethnicityCoefficient }) =>
        !(LEE_ETHNICITY_COEFFICIENTS as readonly number[]).includes(ethnicityCoefficient),
    },
    {
      severity: 'WARNING',
      code: 'NC-ENG-106',
      message: 'Lee se validó en 244 adultos no obesos de 20 a 81 años con IMC menor que 30.',
      when: ({ ageYears, weightKg, heightCm }) =>
        ageYears < 20 || ageYears > 81 || bmiOf(weightKg, heightCm) >= 30,
    },
  ],
  measurements: ({ weightKg, heightCm, skinfoldsMm }) => [
    { field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg },
    { field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm },
    ...Object.entries(skinfoldsMm).map(
      ([site, value]) => ({ field: `skinfoldsMm.${site}`, kind: 'SKINFOLD_MM', value }) as const,
    ),
  ],
  compute: ({ sex, ageYears, heightCm, ethnicityCoefficient, girthsCm, skinfoldsMm }) => {
    const arm = correctedGirthCm(girthsCm.armRelaxed, skinfoldsMm.triceps);
    const thigh = correctedGirthCm(girthsCm.thigh, skinfoldsMm.frontThigh);
    const calf = correctedGirthCm(girthsCm.calf, skinfoldsMm.medialCalf);
    const skeletalMuscleKg =
      cmToM(heightCm) * (0.00744 * arm ** 2 + 0.00088 * thigh ** 2 + 0.00441 * calf ** 2) +
      2.4 * (sex === 'M' ? 1 : 0) -
      0.048 * ageYears +
      ethnicityCoefficient +
      7.8;
    return {
      outputs: {
        skeletalMuscleKg: skeletalMuscleKg as Kg,
        correctedArmGirthCm: arm,
        correctedThighGirthCm: thigh,
        correctedCalfGirthCm: calf,
      },
    };
  },
});
