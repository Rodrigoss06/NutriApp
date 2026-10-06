import { defineMethod } from '../registry/run-method.js';
import type { MethodCode, Sex, ValidityRule } from '../registry/types.js';
import { SITES } from '../sites.js';
import type { Cm, Kg } from '../units.js';

export interface RmrSubject {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly weightKg: Kg;
  readonly heightCm: Cm;
}

export interface RmrOutput {
  readonly rmrKcal: number;
}

export const RMR_MIFFLIN1990 = defineMethod<RmrSubject, RmrOutput>({
  code: 'RMR_MIFFLIN1990',
  version: '1.0.0',
  kind: 'ENERGY',
  population: ['ADULT', 'OLDER_ADULT', 'OBESITY'],
  requiredInputs: ['sex', 'ageYears', 'weightKg', 'heightCm'],
  requiredSites: [SITES.BASIC_WEIGHT, SITES.BASIC_HEIGHT],
  citation: 'Mifflin MD, St Jeor ST, et al. Am J Clin Nutr 1990;51:241-7',
  validity: [
    {
      severity: 'WARNING',
      code: 'NC-ENG-201',
      message: 'Mifflin-St Jeor se validó en 498 adultos sanos de 19 a 78 años.',
      when: ({ ageYears }) => ageYears < 19 || ageYears > 78,
    },
  ],
  compute: ({ sex, ageYears, weightKg, heightCm }) => ({
    outputs: { rmrKcal: 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'M' ? 5 : -161) },
  }),
});

export const RMR_HB1919 = defineMethod<RmrSubject, RmrOutput>({
  code: 'RMR_HB1919',
  version: '1.0.0',
  kind: 'ENERGY',
  population: ['ADULT', 'OLDER_ADULT'],
  requiredInputs: ['sex', 'ageYears', 'weightKg', 'heightCm'],
  requiredSites: [SITES.BASIC_WEIGHT, SITES.BASIC_HEIGHT],
  citation: 'Harris JA, Benedict FG. A biometric study of basal metabolism in man, 1919',
  validity: [
    {
      severity: 'WARNING',
      code: 'NC-ENG-202',
      message: 'Harris-Benedict se basó en 136 hombres de 16 a 63 años y 103 mujeres de hasta 74.',
      when: ({ sex, ageYears }) => ageYears < 18 || (sex === 'M' ? ageYears > 63 : ageYears > 74),
    },
  ],
  compute: ({ sex, ageYears, weightKg, heightCm }) => ({
    outputs: {
      rmrKcal:
        sex === 'M'
          ? 66.473 + 13.7516 * weightKg + 5.0033 * heightCm - 6.755 * ageYears
          : 655.0955 + 9.5634 * weightKg + 1.8496 * heightCm - 4.6756 * ageYears,
    },
  }),
});

interface SchofieldBand {
  /** Edad mínima de la banda, inclusive; la banda llega hasta la siguiente. */
  readonly fromAge: number;
  readonly perKg: number;
  readonly constant: number;
}

/** Schofield (1985), tabla 5.2 de FAO/OMS/UNU 2004: bandas desde 0 años. */
export const SCHOFIELD_BANDS: Readonly<Record<Sex, readonly [SchofieldBand, ...SchofieldBand[]]>> =
  {
    M: [
      { fromAge: 0, perKg: 59.512, constant: -30.4 },
      { fromAge: 3, perKg: 22.706, constant: 504.3 },
      { fromAge: 10, perKg: 17.686, constant: 658.2 },
      { fromAge: 18, perKg: 15.057, constant: 692.2 },
      { fromAge: 30, perKg: 11.472, constant: 873.1 },
      { fromAge: 60, perKg: 11.711, constant: 587.7 },
    ],
    F: [
      { fromAge: 0, perKg: 58.317, constant: -31.1 },
      { fromAge: 3, perKg: 20.315, constant: 485.9 },
      { fromAge: 10, perKg: 13.384, constant: 692.6 },
      { fromAge: 18, perKg: 14.818, constant: 486.6 },
      { fromAge: 30, perKg: 8.126, constant: 845.6 },
      { fromAge: 60, perKg: 9.082, constant: 658.5 },
    ],
  };

export interface SchofieldInput {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly weightKg: Kg;
}

/** Todas las edades tienen banda (03, «Validez por método»): sin validez que advertir. */
export const BMR_SCHOFIELD1985 = defineMethod<SchofieldInput, RmrOutput>({
  code: 'BMR_SCHOFIELD1985',
  version: '1.0.0',
  kind: 'ENERGY',
  population: 'ALL',
  requiredInputs: ['sex', 'ageYears', 'weightKg'],
  requiredSites: [SITES.BASIC_WEIGHT],
  citation:
    'Schofield WN. Hum Nutr Clin Nutr 1985;39 Suppl 1:5-41; adoptadas en FAO/OMS/UNU, Human energy requirements 2004, tabla 5.2',
  validity: [],
  compute: ({ sex, ageYears, weightKg }) => {
    const bands = SCHOFIELD_BANDS[sex];
    // Bandas en orden creciente: queda la última cuya edad mínima se alcanzó.
    let band = bands[0];
    for (const candidate of bands) if (ageYears >= candidate.fromAge) band = candidate;
    return { outputs: { rmrKcal: band.perKg * weightKg + band.constant } };
  },
});

export interface FatFreeMassInput {
  readonly ageYears: number;
  /** Masa libre de grasa de una evaluación, con el método que la calculó (RN-E01). */
  readonly fatFreeMassKg?: Kg;
  readonly fatFreeMassMethodCode?: MethodCode;
}

const fatFreeMassValidity = (name: string): ValidityRule<FatFreeMassInput>[] => [
  {
    severity: 'ERROR',
    code: 'NC-ENG-203',
    message: `${name} necesita la masa libre de grasa de una evaluación y el método que la calculó.`,
    when: ({ fatFreeMassKg, fatFreeMassMethodCode }) =>
      fatFreeMassKg === undefined || fatFreeMassMethodCode === undefined,
  },
  {
    severity: 'WARNING',
    code: 'NC-ENG-204',
    message: `${name} es una ecuación de adultos.`,
    when: ({ ageYears }) => ageYears < 18,
  },
];

export const RMR_CUNNINGHAM1980 = defineMethod<FatFreeMassInput, RmrOutput>({
  code: 'RMR_CUNNINGHAM1980',
  version: '1.0.0',
  kind: 'ENERGY',
  population: ['ADULT', 'ATHLETE'],
  requiredInputs: ['ageYears', 'fatFreeMassKg', 'fatFreeMassMethodCode'],
  requiredSites: [],
  citation: 'Cunningham JJ. Am J Clin Nutr 1980;33:2372-4 (reanálisis de Harris y Benedict)',
  validity: fatFreeMassValidity('Cunningham'),
  compute: ({ fatFreeMassKg = 0 as Kg }) => ({ outputs: { rmrKcal: 500 + 22 * fatFreeMassKg } }),
});

export const RMR_KATCH_MCARDLE = defineMethod<FatFreeMassInput, RmrOutput>({
  code: 'RMR_KATCH_MCARDLE',
  version: '1.0.0',
  kind: 'ENERGY',
  population: ['ADULT', 'ATHLETE'],
  requiredInputs: ['ageYears', 'fatFreeMassKg', 'fatFreeMassMethodCode'],
  requiredSites: [],
  citation: 'Katch FI, McArdle WD. Nutrition, weight control and exercise, 1977',
  validity: fatFreeMassValidity('Katch-McArdle'),
  compute: ({ fatFreeMassKg = 0 as Kg }) => ({ outputs: { rmrKcal: 370 + 21.6 * fatFreeMassKg } }),
});
