import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { kcalOfMacros, type Macros } from './macros.js';

/** Grupos que usa el algoritmo clásico (RN-E08). */
export const EXCHANGE_GROUP_CODES = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
export type ExchangeGroupCode = (typeof EXCHANGE_GROUP_CODES)[number];

export interface ExchangeGroup extends Macros {
  readonly code: string;
}

/** Lista versionada (RN-E11): el plan guarda la versión que usó. */
export interface ExchangeList {
  readonly code: string;
  readonly version: string;
  readonly provisional: boolean;
  readonly groups: readonly ExchangeGroup[];
}

/**
 * Lista de demostración del motor de referencia, con valores tipo ADA. Provisional hasta tener
 * permiso de uso de las listas Dextre y ADA (riesgo R4).
 */
export const DEMO_EXCHANGE_LIST: ExchangeList = {
  code: 'DEMO',
  version: '1.0.0',
  provisional: true,
  groups: [
    { code: 'VEG', choG: 5, proteinG: 2, fatG: 0 },
    { code: 'FRU', choG: 15, proteinG: 0, fatG: 0 },
    { code: 'MILK', choG: 12, proteinG: 8, fatG: 0 },
    { code: 'STA', choG: 15, proteinG: 3, fatG: 1 },
    { code: 'MEAT', choG: 0, proteinG: 7, fatG: 2 },
    { code: 'FAT', choG: 0, proteinG: 0, fatG: 5 },
  ],
};

export interface ExchangesInput {
  readonly target: Macros;
  readonly fixedServings: { readonly VEG: number; readonly FRU: number; readonly MILK: number };
  readonly list: ExchangeList;
}

export interface ExchangesOutput {
  readonly servings: Readonly<Record<ExchangeGroupCode, number>>;
  readonly totals: Macros;
  readonly kcal: number;
  readonly adequacyPct: {
    readonly kcal: number;
    readonly cho: number;
    readonly protein: number;
    readonly fat: number;
  };
}

const EMPTY_OUTPUT: ExchangesOutput = {
  servings: { VEG: 0, FRU: 0, MILK: 0, STA: 0, MEAT: 0, FAT: 0 },
  totals: { choG: 0, proteinG: 0, fatG: 0 },
  kcal: 0,
  adequacyPct: { kcal: 0, cho: 0, protein: 0, fat: 0 },
};

/**
 * Algoritmo clásico: se fijan verduras, frutas y lácteos y se despejan almidones por carbohidratos,
 * carnes por proteína y grasas por grasa, con intercambios enteros y no negativos (RN-E08, RN-E10).
 */
export const EXCHANGES_CLASSIC = defineMethod<ExchangesInput, ExchangesOutput>({
  code: 'EXCHANGES_CLASSIC',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['target', 'fixedServings', 'list'],
  requiredSites: [],
  citation: 'Sistema de intercambios (Exchange Lists for Meal Planning, ADA; Dextre et al. 2022)',
  validity: [],
  compute: ({ target, fixedServings, list }) => {
    const groups = new Map(list.groups.map((group) => [group.code, group]));
    if (!EXCHANGE_GROUP_CODES.every((code) => groups.has(code))) {
      return {
        outputs: EMPTY_OUTPUT,
        issues: [
          {
            rule: 'RN-E08',
            severity: 'ERROR',
            code: 'NC-ENG-304',
            message:
              'La lista de intercambios necesita los grupos VEG, FRU, MILK, STA, MEAT y FAT.',
          },
        ],
      };
    }
    const group = (code: ExchangeGroupCode) => groups.get(code) as ExchangeGroup;
    const servings: Record<ExchangeGroupCode, number> = {
      ...fixedServings,
      STA: 0,
      MEAT: 0,
      FAT: 0,
    };
    const total = (macro: keyof Macros): number =>
      EXCHANGE_GROUP_CODES.reduce((sum, code) => sum + servings[code] * group(code)[macro], 0);

    const clamped: ExchangeGroupCode[] = [];
    const solve = (code: 'STA' | 'MEAT' | 'FAT', macro: keyof Macros) => {
      const value = Math.round((target[macro] - total(macro)) / group(code)[macro]);
      if (value < 0) clamped.push(code);
      servings[code] = Math.max(0, value);
    };
    solve('STA', 'choG');
    solve('MEAT', 'proteinG');
    solve('FAT', 'fatG');

    const totals: Macros = {
      choG: total('choG'),
      proteinG: total('proteinG'),
      fatG: total('fatG'),
    };
    const kcal = kcalOfMacros(totals);
    const issues: Issue[] =
      clamped.length > 0
        ? [
            {
              rule: 'RN-E08',
              severity: 'WARNING',
              code: 'NC-ENG-303',
              message: `Los grupos fijos ya superan el objetivo: ${clamped.join(', ')} queda en 0.`,
            },
          ]
        : [];
    return {
      outputs: {
        servings,
        totals,
        kcal,
        adequacyPct: {
          kcal: (kcal / kcalOfMacros(target)) * 100,
          cho: (totals.choG / target.choG) * 100,
          protein: (totals.proteinG / target.proteinG) * 100,
          fat: (totals.fatG / target.fatG) * 100,
        },
      },
      issues,
    };
  },
});

export interface MealShare {
  readonly meal: string;
  readonly pct: number;
}

export interface MealSplitInput {
  readonly totalServings: number;
  /** En orden: ante residuos iguales gana el tiempo que va primero. */
  readonly meals: readonly MealShare[];
}

export interface MealSplitOutput {
  readonly servingsByMeal: readonly { readonly meal: string; readonly servings: number }[];
}

const splitIssue = (code: 'NC-ENG-305' | 'NC-ENG-306', message: string): Issue => ({
  rule: 'RN-E09',
  severity: 'ERROR',
  code,
  message,
});

/** Reparto por el método del mayor residuo: la suma por tiempos es exactamente el total (RN-E09). */
export const MEAL_SPLIT_LARGEST_REMAINDER = defineMethod<MealSplitInput, MealSplitOutput>({
  code: 'MEAL_SPLIT_LARGEST_REMAINDER',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['totalServings', 'meals'],
  requiredSites: [],
  citation: 'Método del mayor residuo (Hamilton); guía de dominio §5.5',
  validity: [],
  compute: ({ totalServings, meals }) => {
    if (!Number.isInteger(totalServings) || totalServings < 0) {
      return {
        outputs: { servingsByMeal: [] },
        issues: [splitIssue('NC-ENG-306', 'El total de intercambios es un entero no negativo.')],
      };
    }
    const pctSum = meals.reduce((sum, { pct }) => sum + pct, 0);
    if (Math.abs(pctSum - 100) > 1e-9) {
      return {
        outputs: { servingsByMeal: [] },
        issues: [splitIssue('NC-ENG-305', 'Los porcentajes de los tiempos de comida suman 100.')],
      };
    }
    const rows = meals.map(({ meal, pct }) => {
      const exact = (totalServings * pct) / 100;
      return { meal, servings: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let missing = totalServings - rows.reduce((sum, row) => sum + row.servings, 0);
    // sort es estable: con residuos iguales se respeta el orden de los tiempos.
    for (const row of [...rows].sort((a, b) => b.remainder - a.remainder)) {
      if (missing <= 0) break;
      row.servings += 1;
      missing -= 1;
    }
    return { outputs: { servingsByMeal: rows.map(({ meal, servings }) => ({ meal, servings })) } };
  },
});
