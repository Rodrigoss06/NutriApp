import { defineMethod } from '../registry/run-method.js';
import { SITES } from '../sites.js';
import type { Cm } from '../units.js';

const ROSS_MARFELL_JONES =
  'Ross WD, Marfell-Jones MJ. Kinanthropometry, 1991; índices de proporcionalidad';

export interface HeightsInput {
  readonly heightCm: Cm;
  readonly sittingHeightCm: Cm;
}

/** Índice córmico = talla sentado ÷ talla × 100. Los puntos de corte son datos (RN-D10). */
export const CORMIC_INDEX = defineMethod<HeightsInput, { readonly index: number }>({
  code: 'CORMIC_INDEX',
  version: '1.0.0',
  kind: 'PROPORTIONALITY',
  population: 'ALL',
  requiredInputs: ['heightCm', 'sittingHeightCm'],
  requiredSites: [SITES.BASIC_HEIGHT, SITES.BASIC_SITTING_HEIGHT],
  citation: ROSS_MARFELL_JONES,
  validity: [],
  measurements: ({ heightCm }) => [{ field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm }],
  compute: ({ heightCm, sittingHeightCm }) => ({
    outputs: { index: (sittingHeightCm / heightCm) * 100 },
  }),
});

/** Índice de Manouvrier = (talla − talla sentado) ÷ talla sentado × 100. */
export const MANOUVRIER_INDEX = defineMethod<HeightsInput, { readonly index: number }>({
  code: 'MANOUVRIER_INDEX',
  version: '1.0.0',
  kind: 'PROPORTIONALITY',
  population: 'ALL',
  requiredInputs: ['heightCm', 'sittingHeightCm'],
  requiredSites: [SITES.BASIC_HEIGHT, SITES.BASIC_SITTING_HEIGHT],
  citation: ROSS_MARFELL_JONES,
  validity: [],
  measurements: ({ heightCm }) => [{ field: 'heightCm', kind: 'HEIGHT_CM', value: heightCm }],
  compute: ({ heightCm, sittingHeightCm }) => ({
    outputs: { index: ((heightCm - sittingHeightCm) / sittingHeightCm) * 100 },
  }),
});

export interface BreadthsInput {
  readonly biiliocristalCm: Cm;
  readonly biacromialCm: Cm;
}

/** Índice acromio-ilíaco = Ø biiliocrestal ÷ Ø biacromial × 100. */
export const ACROMIOILIAC_INDEX = defineMethod<BreadthsInput, { readonly index: number }>({
  code: 'ACROMIOILIAC_INDEX',
  version: '1.0.0',
  kind: 'PROPORTIONALITY',
  population: 'ALL',
  requiredInputs: ['biiliocristalCm', 'biacromialCm'],
  requiredSites: [SITES.BREADTH_BIILIOCRISTAL, SITES.BREADTH_BIACROMIAL],
  citation: ROSS_MARFELL_JONES,
  validity: [],
  compute: ({ biiliocristalCm, biacromialCm }) => ({
    outputs: { index: (biiliocristalCm / biacromialCm) * 100 },
  }),
});
