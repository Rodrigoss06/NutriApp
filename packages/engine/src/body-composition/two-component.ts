import { defineMethod } from '../registry/run-method.js';
import type { MeasurementCheck, Population, Sex, ValidityRule } from '../registry/types.js';
import { SITES } from '../sites.js';
import { sum } from '../stats.js';
import type { Kg, Mm } from '../units.js';

/** Datos del paciente que piden las ecuaciones de grasa. */
export interface FatSubject {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly population: Population;
  readonly weightKg: Kg;
}

export interface TwoComponentOutput {
  readonly fatPct: number;
  readonly fatMassKg: Kg;
  readonly fatFreeMassKg: Kg;
}

export interface DensityOutput extends TwoComponentOutput {
  readonly density: number;
}

/** Masa grasa y masa libre de grasa a partir del % de grasa. */
export function twoComponent(weightKg: Kg, fatPct: number): TwoComponentOutput {
  const fatMassKg = ((weightKg * fatPct) / 100) as Kg;
  return { fatPct, fatMassKg, fatFreeMassKg: (weightKg - fatMassKg) as Kg };
}

/** Siri (1961): % de grasa = 495 / densidad − 450. */
export const fatPctSiri = (density: number): number => 495 / density - 450;

const checks = (weightKg: Kg, skinfoldsMm: Readonly<Record<string, Mm>>): MeasurementCheck[] => [
  { field: 'weightKg', kind: 'WEIGHT_KG', value: weightKg },
  ...Object.entries(skinfoldsMm).map(([site, value]): MeasurementCheck => ({
    field: `skinfoldsMm.${site}`,
    kind: 'SKINFOLD_MM',
    value,
  })),
];

/** Años cumplidos: las bandas de edad de las ecuaciones son por años enteros. */
const completedYears = (ageYears: number): number => Math.floor(ageYears);

// ─── Durnin y Womersley (1974) + Siri (1961) ──────────────────────────────

interface DensityBand {
  readonly minAge: number;
  readonly maxAge: number;
  readonly c: number;
  readonly m: number;
}

/**
 * Coeficientes del artículo original por banda de edad (03, «Validez por método»). Hombres de 50 o más:
 * m = 0.0779; el consenso GREC 2009 imprime 0.0799, una errata (ADR-022).
 */
export const DURNIN_WOMERSLEY_BANDS: Readonly<Record<Sex, readonly DensityBand[]>> = {
  M: [
    { minAge: 17, maxAge: 19, c: 1.162, m: 0.063 },
    { minAge: 20, maxAge: 29, c: 1.1631, m: 0.0632 },
    { minAge: 30, maxAge: 39, c: 1.1422, m: 0.0544 },
    { minAge: 40, maxAge: 49, c: 1.162, m: 0.07 },
    { minAge: 50, maxAge: 72, c: 1.1715, m: 0.0779 },
  ],
  F: [
    { minAge: 16, maxAge: 19, c: 1.1549, m: 0.0678 },
    { minAge: 20, maxAge: 29, c: 1.1599, m: 0.0717 },
    { minAge: 30, maxAge: 39, c: 1.1423, m: 0.0632 },
    { minAge: 40, maxAge: 49, c: 1.1333, m: 0.0612 },
    { minAge: 50, maxAge: 68, c: 1.1339, m: 0.0645 },
  ],
};

const durninWomersleyBand = (sex: Sex, ageYears: number): DensityBand | undefined => {
  const age = completedYears(ageYears);
  return DURNIN_WOMERSLEY_BANDS[sex].find((band) => age >= band.minAge && age <= band.maxAge);
};

export interface DurninWomersleyInput extends FatSubject {
  readonly skinfoldsMm: {
    readonly triceps: Mm;
    readonly biceps: Mm;
    readonly subscapular: Mm;
    readonly iliacCrest: Mm;
  };
}

export const FAT_DW1974_SIRI1961 = defineMethod<
  DurninWomersleyInput,
  DensityOutput & { readonly sum4Mm: number }
>({
  code: 'FAT_DW1974_SIRI1961',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT', 'OLDER_ADULT'],
  requiredInputs: ['sex', 'ageYears', 'weightKg', 'skinfoldsMm'],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.SKF_TRICEPS,
    SITES.SKF_BICEPS,
    SITES.SKF_SUBSCAPULAR,
    SITES.SKF_ILIAC_CREST,
  ],
  citation:
    'Durnin JVGA, Womersley J. Br J Nutr 1974;32:77-97. Siri WE. Body composition from fluid spaces and density, 1961',
  validity: [
    {
      severity: 'ERROR',
      code: 'NC-ENG-101',
      message:
        'Durnin y Womersley tiene coeficientes para hombres de 17 a 72 años y mujeres de 16 a 68: no se calcula.',
      when: ({ sex, ageYears }) => durninWomersleyBand(sex, ageYears) === undefined,
    },
    {
      severity: 'WARNING',
      code: 'NC-ENG-102',
      message:
        'Siri en menores de 18 años: la densidad de la masa libre de grasa es menor en jóvenes y el % de grasa se sobrestima.',
      when: ({ ageYears }) => ageYears < 18,
    },
  ],
  measurements: ({ weightKg, skinfoldsMm }) => checks(weightKg, skinfoldsMm),
  compute: ({ sex, ageYears, weightKg, skinfoldsMm }) => {
    // La validez ERROR ya descartó las edades sin banda.
    const band = durninWomersleyBand(sex, ageYears) as DensityBand;
    const sum4Mm = sum(Object.values(skinfoldsMm));
    const density = band.c - band.m * Math.log10(sum4Mm);
    return { outputs: { sum4Mm, density, ...twoComponent(weightKg, fatPctSiri(density)) } };
  },
});

// ─── Jackson y Pollock, 7 pliegues ────────────────────────────────────────

export interface JacksonPollock7Input extends FatSubject {
  readonly skinfoldsMm: {
    readonly chest: Mm;
    readonly midaxillary: Mm;
    readonly triceps: Mm;
    readonly subscapular: Mm;
    readonly abdominal: Mm;
    readonly suprailiac: Mm;
    readonly frontThigh: Mm;
  };
}

/** Muestra de validación: no deportistas, hombres de 18 a 61 años y mujeres de 18 a 55. */
const JP7_VALIDATED_AGE: Readonly<Record<Sex, readonly [number, number]>> = {
  M: [18, 61],
  F: [18, 55],
};

const jp7Validity: ValidityRule<JacksonPollock7Input> = {
  severity: 'WARNING',
  code: 'NC-ENG-103',
  message:
    'Jackson y Pollock se validó en no deportistas: hombres de 18 a 61 años y mujeres de 18 a 55.',
  when: ({ sex, ageYears, population }) => {
    const [min, max] = JP7_VALIDATED_AGE[sex];
    return population === 'ATHLETE' || ageYears < min || ageYears > max;
  },
};

export const FAT_JP1978_7 = defineMethod<
  JacksonPollock7Input,
  DensityOutput & { readonly sum7Mm: number }
>({
  code: 'FAT_JP1978_7',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ADULT'],
  requiredInputs: ['sex', 'ageYears', 'population', 'weightKg', 'skinfoldsMm'],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.SKF_CHEST,
    SITES.SKF_MIDAXILLARY,
    SITES.SKF_SUPRAILIAC,
    SITES.SKF_TRICEPS,
    SITES.SKF_SUBSCAPULAR,
    SITES.SKF_ABDOMINAL,
    SITES.SKF_FRONT_THIGH,
  ],
  citation:
    'Jackson AS, Pollock ML. Br J Nutr 1978;40:497-504. Jackson AS, Pollock ML, Ward A. Med Sci Sports Exerc 1980;12:175-81. Siri 1961',
  validity: [jp7Validity],
  measurements: ({ weightKg, skinfoldsMm }) => checks(weightKg, skinfoldsMm),
  compute: ({ sex, ageYears, weightKg, skinfoldsMm }) => {
    const sum7Mm = sum(Object.values(skinfoldsMm));
    const density =
      sex === 'M'
        ? 1.112 - 0.00043499 * sum7Mm + 0.00000055 * sum7Mm ** 2 - 0.00028826 * ageYears
        : 1.097 - 0.00046971 * sum7Mm + 0.00000056 * sum7Mm ** 2 - 0.00012828 * ageYears;
    return { outputs: { sum7Mm, density, ...twoComponent(weightKg, fatPctSiri(density)) } };
  },
});

// ─── Faulkner y Yuhasz: % de grasa directo ────────────────────────────────

export interface FaulknerInput extends FatSubject {
  readonly skinfoldsMm: {
    readonly triceps: Mm;
    readonly subscapular: Mm;
    readonly supraspinale: Mm;
    readonly abdominal: Mm;
  };
}

export const FAT_FAULKNER1968 = defineMethod<
  FaulknerInput,
  TwoComponentOutput & { readonly sum4Mm: number }
>({
  code: 'FAT_FAULKNER1968',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ATHLETE'],
  requiredInputs: ['sex', 'population', 'weightKg', 'skinfoldsMm'],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.SKF_TRICEPS,
    SITES.SKF_SUBSCAPULAR,
    SITES.SKF_SUPRASPINALE,
    SITES.SKF_ABDOMINAL,
  ],
  citation:
    'Faulkner JA 1968. Combinación de coeficientes de Yuhasz sin muestra propia: Rev Bras Cineantropom Desempenho Hum 2007',
  validity: [
    {
      severity: 'WARNING',
      code: 'NC-ENG-104',
      message:
        'Faulkner se propuso para hombres jóvenes entrenados, sin muestra de validación propia ni validación en mujeres.',
      when: ({ sex, population }) => sex === 'F' || population !== 'ATHLETE',
    },
  ],
  measurements: ({ weightKg, skinfoldsMm }) => checks(weightKg, skinfoldsMm),
  compute: ({ weightKg, skinfoldsMm }) => {
    const sum4Mm = sum(Object.values(skinfoldsMm));
    return { outputs: { sum4Mm, ...twoComponent(weightKg, 0.153 * sum4Mm + 5.783) } };
  },
});

export interface YuhaszInput extends FatSubject {
  readonly skinfoldsMm: {
    readonly triceps: Mm;
    readonly subscapular: Mm;
    readonly supraspinale: Mm;
    readonly abdominal: Mm;
    readonly frontThigh: Mm;
    readonly medialCalf: Mm;
  };
}

export const FAT_YUHASZ1974 = defineMethod<
  YuhaszInput,
  TwoComponentOutput & { readonly sum6Mm: number }
>({
  code: 'FAT_YUHASZ1974',
  version: '1.0.0',
  kind: 'BODY_COMPOSITION',
  population: ['ATHLETE'],
  requiredInputs: ['sex', 'population', 'weightKg', 'skinfoldsMm'],
  requiredSites: [
    SITES.BASIC_WEIGHT,
    SITES.SKF_TRICEPS,
    SITES.SKF_SUBSCAPULAR,
    SITES.SKF_SUPRASPINALE,
    SITES.SKF_ABDOMINAL,
    SITES.SKF_FRONT_THIGH,
    SITES.SKF_MEDIAL_CALF,
  ],
  citation: 'Yuhasz MS 1974; versión de 6 pliegues de Carter JEL 1982',
  validity: [
    {
      severity: 'WARNING',
      code: 'NC-ENG-105',
      message: 'Yuhasz se validó en deportistas adultos jóvenes.',
      when: ({ population }) => population !== 'ATHLETE',
    },
  ],
  measurements: ({ weightKg, skinfoldsMm }) => checks(weightKg, skinfoldsMm),
  compute: ({ sex, weightKg, skinfoldsMm }) => {
    const sum6Mm = sum(Object.values(skinfoldsMm));
    const fatPct = sex === 'M' ? 0.1051 * sum6Mm + 2.585 : 0.1548 * sum6Mm + 3.58;
    return { outputs: { sum6Mm, ...twoComponent(weightKg, fatPct) } };
  },
});
