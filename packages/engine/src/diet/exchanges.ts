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

export interface StarchByDayProfileMeal {
  readonly meal: string;
  /** BREAKFAST, MID_MORNING, LUNCH, AFTERNOON, DINNER o CUSTOM. */
  readonly slotCode: string;
  /** Los intercambios de almidones del tiempo en el plan (Entrenamiento). */
  readonly starch: number;
}

export interface StarchByDayProfileInput {
  /** Los carbohidratos del plan, sumados de sus intercambios. */
  readonly baseChoG: number;
  /** La meta de carbohidratos del perfil. */
  readonly profileChoG: number;
  /** Los carbohidratos de un intercambio de almidones en la lista del plan (RN-E11). */
  readonly starchChoG: number;
  /** Los tiempos en el orden del día. */
  readonly meals: readonly StarchByDayProfileMeal[];
}

export interface StarchByDayProfileOutput {
  /** Los intercambios de almidones que pide el perfil frente al plan: negativo, de menos. */
  readonly deltaServings: number;
  readonly servingsByMeal: readonly { readonly meal: string; readonly servings: number }[];
}

/** Las comidas de antes y después de entrenar (P-20.5 y P-20.6): ahí se quitan primero y ahí se suman. */
const AROUND_TRAINING = ['AFTERNOON', 'DINNER'];

/** Los tiempos en el orden en que pierden almidones: la media tarde, la cena y después del último del día al primero. */
function removalOrder(meals: readonly StarchByDayProfileMeal[]): number[] {
  const rank = (index: number): number => {
    const found = AROUND_TRAINING.indexOf(meals[index]?.slotCode ?? '');
    return found === -1 ? AROUND_TRAINING.length : found;
  };
  return meals.map((_, index) => index).sort((a, b) => rank(a) - rank(b) || b - a);
}

/** Los tiempos que ganan almidones, por turnos: la media tarde y la cena; si el plan no tiene ninguna, del último al primero. */
function additionOrder(meals: readonly StarchByDayProfileMeal[]): number[] {
  const order = removalOrder(meals);
  const around = order.filter((index) => AROUND_TRAINING.includes(meals[index]?.slotCode ?? ''));
  return around.length > 0 ? around : order;
}

const nonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

/**
 * Los almidones de un perfil de día por tiempo de comida (07 §2, P-20.5): el perfil es el mismo plan con más o menos
 * intercambios de almidones, y lo demás no cambia. Los que pide salen de la diferencia de carbohidratos entre el perfil y el
 * plan, en intercambios enteros (medio cuenta como uno). Los de menos se quitan primero de la media tarde, luego de la cena y
 * después del último tiempo del día al primero, sin bajar de 0. Los de más se suman de a uno, alternando la media tarde y
 * la cena (P-20.6); un plan sin ninguna de las dos los suma por turnos del último tiempo al primero. Es la sugerencia: el
 * coach la cambia (RN-E09).
 */
export const STARCH_BY_DAY_PROFILE = defineMethod<
  StarchByDayProfileInput,
  StarchByDayProfileOutput
>({
  code: 'STARCH_BY_DAY_PROFILE',
  version: '1.0.0',
  kind: 'DIET',
  population: 'ALL',
  requiredInputs: ['baseChoG', 'profileChoG', 'starchChoG', 'meals'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, P-20.5 y P-20.6 (respuestas de Jeremy del 2026-11-08 y del 2026-11-09): menos almidones, primero en la media tarde y luego en la cena; más almidones, alternando la media tarde y la cena',
  validity: [
    {
      rule: 'RN-E09',
      severity: 'ERROR',
      code: 'NC-ENG-313',
      message:
        'Un intercambio de almidones tiene más de 0 g de carbohidratos, y los del plan y los del perfil no son negativos.',
      when: ({ baseChoG, profileChoG, starchChoG }) =>
        !(Number.isFinite(starchChoG) && starchChoG > 0) ||
        !nonNegative(baseChoG) ||
        !nonNegative(profileChoG),
    },
    {
      rule: 'RN-E09',
      severity: 'ERROR',
      code: 'NC-ENG-314',
      message:
        'El plan tiene al menos un tiempo de comida y sus almidones son enteros no negativos.',
      when: ({ meals }) =>
        meals.length === 0 ||
        meals.some((meal) => !Number.isInteger(meal.starch) || meal.starch < 0),
    },
  ],
  compute: ({ baseChoG, profileChoG, starchChoG, meals }) => {
    const exact = (profileChoG - baseChoG) / starchChoG;
    // Medio intercambio cuenta como uno, de más o de menos; || 0 evita el -0.
    const deltaServings = (exact < 0 ? -Math.round(-exact) : Math.round(exact)) || 0;
    const servings = meals.map((meal) => meal.starch);
    if (deltaServings > 0) {
      const order = additionOrder(meals);
      for (let added = 0; added < deltaServings; added += 1) {
        const index = order[added % order.length] ?? 0;
        servings[index] = (servings[index] ?? 0) + 1;
      }
    } else {
      let missing = -deltaServings;
      for (const index of removalOrder(meals)) {
        if (missing <= 0) break;
        const taken = Math.min(missing, servings[index] ?? 0);
        servings[index] = (servings[index] ?? 0) - taken;
        missing -= taken;
      }
    }
    return {
      outputs: {
        deltaServings,
        servingsByMeal: meals.map(({ meal }, index) => ({ meal, servings: servings[index] ?? 0 })),
      },
    };
  },
});
