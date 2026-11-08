import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import type { Kg } from '../units.js';

/** Factores de Atwater, kcal por gramo (RN-E07). */
export const ATWATER_KCAL_PER_G = { cho: 4, protein: 4, fat: 9, alcohol: 7 } as const;

/** Rango aceptado de grasa como % de las kcal (RN-E07). */
export const FAT_PCT_KCAL_RANGE = [20, 35] as const;

export interface Macros {
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

export const kcalOfMacros = ({ choG, proteinG, fatG }: Macros): number =>
  choG * ATWATER_KCAL_PER_G.cho +
  proteinG * ATWATER_KCAL_PER_G.protein +
  fatG * ATWATER_KCAL_PER_G.fat;

export interface MacrosInput {
  readonly targetKcal: number;
  readonly weightKg: Kg;
  readonly proteinGPerKg: number;
  readonly fatPctKcal: number;
}

/** Proteína por g/kg, grasa como % de las kcal y carbohidratos con lo que queda (RN-E07). */
export const MACROS_PROTEIN_FIRST = defineMethod<MacrosInput, Macros>({
  code: 'MACROS_PROTEIN_FIRST',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['targetKcal', 'weightKg', 'proteinGPerKg', 'fatPctKcal'],
  requiredSites: [],
  citation: 'Factores de Atwater; reparto con proteína primero, guía de dominio §5.1',
  validity: [],
  compute: ({ targetKcal, weightKg, proteinGPerKg, fatPctKcal }) => {
    const proteinG = proteinGPerKg * weightKg;
    const fatG = (targetKcal * fatPctKcal) / 100 / ATWATER_KCAL_PER_G.fat;
    const choG =
      (targetKcal - proteinG * ATWATER_KCAL_PER_G.protein - fatG * ATWATER_KCAL_PER_G.fat) /
      ATWATER_KCAL_PER_G.cho;
    const issues: Issue[] = [];
    const [minFat, maxFat] = FAT_PCT_KCAL_RANGE;
    if (fatPctKcal < minFat || fatPctKcal > maxFat) {
      issues.push({
        rule: 'RN-E07',
        severity: 'WARNING',
        code: 'NC-ENG-301',
        message: 'La grasa aconsejada va de 20 a 35 % de las kcal.',
      });
    }
    if (choG < 0) {
      issues.push({
        rule: 'RN-E07',
        severity: 'ERROR',
        code: 'NC-ENG-302',
        message: 'Los carbohidratos salen negativos: baja la proteína o la grasa, o sube las kcal.',
      });
    }
    return { outputs: { choG, proteinG, fatG }, issues };
  },
});

export interface DayProfileMacrosInput {
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

export interface DayProfileMacros extends Macros {
  readonly kcal: number;
}

const nonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

/**
 * Un perfil de día del plan (07 §2, P-20): el coach escribe los gramos de carbohidratos, proteína y grasa, y las kcal salen
 * de ellos con los factores de Atwater (RN-E07). Mandan los gramos (P-20.2, respuesta de Jeremy del 2026-11-08): la hoja
 * piloto da 2,230 kcal con 240, 160 y 70 g.
 */
export const MACROS_DAY_PROFILE = defineMethod<DayProfileMacrosInput, DayProfileMacros>({
  code: 'MACROS_DAY_PROFILE',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['choG', 'proteinG', 'fatG'],
  requiredSites: [],
  citation: 'Factores de Atwater; perfiles de día de la hoja piloto de JV Fitness (07 §2, P-20)',
  validity: [
    {
      rule: 'RN-E07',
      severity: 'ERROR',
      code: 'NC-ENG-312',
      message: 'Los gramos de un perfil de día no son negativos, y al menos uno es mayor que 0.',
      when: ({ choG, proteinG, fatG }) =>
        !nonNegative(choG) ||
        !nonNegative(proteinG) ||
        !nonNegative(fatG) ||
        choG + proteinG + fatG === 0,
    },
  ],
  compute: ({ choG, proteinG, fatG }) => ({
    outputs: { kcal: kcalOfMacros({ choG, proteinG, fatG }), choG, proteinG, fatG },
  }),
});
