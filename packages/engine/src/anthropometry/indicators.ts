import { defineMethod } from '../registry/run-method.js';
import { SITES } from '../sites.js';
import { mmToCm, type Cm, type Kg, type Mm } from '../units.js';

/** Perímetro corregido: perímetro − π × pliegue en centímetros. */
export const correctedGirthCm = (girthCm: Cm, skinfoldMm: Mm): Cm =>
  (girthCm - Math.PI * mmToCm(skinfoldMm)) as Cm;

export interface BmiInput {
  readonly weightKg: Kg;
  readonly heightCm: Cm;
}

/** IMC = peso ÷ talla² (kg y m). La interpretación sale de rangos versionados (RN-D10). */
export const BMI = defineMethod<BmiInput, { readonly bmi: number }>({
  code: 'BMI',
  version: '1.0.0',
  kind: 'INDICATOR',
  population: 'ALL',
  requiredInputs: ['weightKg', 'heightCm'],
  requiredSites: [SITES.BASIC_WEIGHT, SITES.BASIC_HEIGHT],
  citation: 'Quetelet; OMS 2000, clasificación del IMC',
  validity: [],
  measurements: ({ weightKg, heightCm }) => [
    { field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg },
    { field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm },
  ],
  compute: ({ weightKg, heightCm }) => ({ outputs: { bmi: weightKg / (heightCm / 100) ** 2 } }),
});

export interface WaistHeightInput {
  readonly waistCm: Cm;
  readonly heightCm: Cm;
}

export const WAIST_HEIGHT = defineMethod<WaistHeightInput, { readonly ratio: number }>({
  code: 'WAIST_HEIGHT',
  version: '1.0.0',
  kind: 'INDICATOR',
  population: 'ALL',
  requiredInputs: ['waistCm', 'heightCm'],
  requiredSites: [SITES.GIRTH_WAIST, SITES.BASIC_HEIGHT],
  citation: 'Ashwell y Hsieh 2005, índice cintura/talla',
  validity: [],
  measurements: ({ heightCm }) => [{ field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm }],
  compute: ({ waistCm, heightCm }) => ({ outputs: { ratio: waistCm / heightCm } }),
});

export interface WaistHipInput {
  readonly waistCm: Cm;
  readonly hipCm: Cm;
}

export const WAIST_HIP = defineMethod<WaistHipInput, { readonly ratio: number }>({
  code: 'WAIST_HIP',
  version: '1.0.0',
  kind: 'INDICATOR',
  population: 'ALL',
  requiredInputs: ['waistCm', 'hipCm'],
  requiredSites: [SITES.GIRTH_WAIST, SITES.GIRTH_HIP],
  citation: 'OMS 2008, perímetro de cintura e índice cintura/cadera',
  validity: [],
  compute: ({ waistCm, hipCm }) => ({ outputs: { ratio: waistCm / hipCm } }),
});

export interface CorrectedGirthInput {
  readonly girthCm: Cm;
  readonly skinfoldMm: Mm;
}

export const CORRECTED_GIRTH = defineMethod<CorrectedGirthInput, { readonly correctedGirthCm: Cm }>(
  {
    code: 'CORRECTED_GIRTH',
    version: '1.0.0',
    kind: 'INDICATOR',
    population: 'ALL',
    requiredInputs: ['girthCm', 'skinfoldMm'],
    requiredSites: [],
    citation: 'Lee et al. 2000; Kerr 1988, perímetros corregidos por el pliegue',
    validity: [],
    measurements: ({ skinfoldMm }) => [
      { field: 'skinfoldMm', kind: 'SKINFOLD_MM', value: skinfoldMm },
    ],
    compute: ({ girthCm, skinfoldMm }) => ({
      outputs: { correctedGirthCm: correctedGirthCm(girthCm, skinfoldMm) },
    }),
  },
);
