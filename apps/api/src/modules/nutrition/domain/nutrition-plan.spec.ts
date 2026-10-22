import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEALS,
  exchangePlan,
  publishProblems,
  type ExchangeGroupCode,
  type MealDraft,
  type PlanDraftInput,
  type PlanMethods,
} from './nutrition-plan.js';

const NAMES: Readonly<Record<ExchangeGroupCode, string>> = {
  VEG: 'Verduras',
  FRU: 'Frutas',
  MILK: 'Lácteos',
  STA: 'Almidones',
  MEAT: 'Carnes magras',
  FAT: 'Grasas',
};

/** G-18: con 4 verduras, 3 frutas y 3 lácteos, el método clásico da 6 almidones, 16 carnes y 3 grasas. */
const AUTOMATIC: PlanMethods['automaticServings'] = {
  VEG: 4,
  FRU: 3,
  MILK: 3,
  STA: 6,
  MEAT: 16,
  FAT: 3,
};

/** Un reparto sencillo: todo al primer tiempo. La aplicación usa el mayor residuo del motor. */
const methods = (split: PlanMethods['split'] = (total) => [total, 0, 0, 0, 0]): PlanMethods => ({
  automaticServings: AUTOMATIC,
  split,
});

const DRAFT: PlanDraftInput = {
  fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
  overrides: {},
  meals: DEFAULT_MEALS,
  splitOverrides: {},
  hydrationTargetMl: null,
  instructions: null,
};

/** Un tiempo de los de G-19, por su posición. */
const meal = (index: number): MealDraft => {
  const found = DEFAULT_MEALS[index];
  if (!found) throw new Error(`G-19 no tiene el tiempo ${String(index)}.`);
  return found;
};

const RICE = '01927000-0000-7000-8000-000000000001';
const CHICKEN = '01927000-0000-7000-8000-000000000002';

const problems = (input: PlanDraftInput, using = methods()): unknown => {
  const result = exchangePlan(input, using, NAMES);
  return result.ok ? [] : result.error.details?.problems;
};

describe('RN-E08 · intercambios del día', () => {
  it('los fijos van como los escribe el profesional; almidones, carnes y grasas, del método clásico', () => {
    const result = exchangePlan(DRAFT, methods(), NAMES);

    expect(result.ok && result.value.exchanges).toEqual([
      { groupCode: 'VEG', servings: 4, automatic: 4, manual: false },
      { groupCode: 'FRU', servings: 3, automatic: 3, manual: false },
      { groupCode: 'MILK', servings: 3, automatic: 3, manual: false },
      { groupCode: 'STA', servings: 6, automatic: 6, manual: false },
      { groupCode: 'MEAT', servings: 16, automatic: 16, manual: false },
      { groupCode: 'FAT', servings: 3, automatic: 3, manual: false },
    ]);
  });

  it('un ajuste a mano reemplaza al automático, queda marcado y conserva lo que daba el método', () => {
    const result = exchangePlan({ ...DRAFT, overrides: { MEAT: 15 } }, methods(), NAMES);

    expect(result.ok && result.value.exchanges.find((e) => e.groupCode === 'MEAT')).toEqual({
      groupCode: 'MEAT',
      servings: 15,
      automatic: 16,
      manual: true,
    });
  });
});

describe('RN-E09 · reparto por tiempos de comida', () => {
  it('empieza con los cinco tiempos de G-19: 25, 10, 35, 10 y 20 %', () => {
    expect(DEFAULT_MEALS.map((m) => [m.slotCode, m.name, m.sharePct])).toEqual([
      ['BREAKFAST', 'Desayuno', 25],
      ['MID_MORNING', 'Media mañana', 10],
      ['LUNCH', 'Almuerzo', 35],
      ['AFTERNOON', 'Media tarde', 10],
      ['DINNER', 'Cena', 20],
    ]);
  });

  it('los porcentajes de los tiempos suman 100', () => {
    const meals = DEFAULT_MEALS.map((meal, i) => (i === 0 ? { ...meal, sharePct: 30 } : meal));

    expect(problems({ ...DRAFT, meals })).toEqual([
      'Los porcentajes de los tiempos de comida suman 105: deben sumar 100 (RN-E09).',
    ]);
    const thirds = [33.33, 33.33, 33.34].map((sharePct, i) => ({
      ...meal(i),
      sharePct,
    }));
    expect(
      problems(
        { ...DRAFT, meals: thirds },
        methods((total) => [total, 0, 0]),
      ),
    ).toEqual([]);
  });

  it('cada grupo se reparte con su total del día; el reparto a mano reemplaza al automático y queda marcado', () => {
    const result = exchangePlan(
      { ...DRAFT, splitOverrides: { MILK: [1, 0, 0, 1, 1] } },
      methods((total) => [total, 0, 0, 0, 0]),
      NAMES,
    );

    expect(result.ok && result.value.manualSplit).toEqual(['MILK']);
    expect(result.ok && result.value.meals.map((m) => m.servings.MILK)).toEqual([1, 0, 0, 1, 1]);
    expect(result.ok && result.value.meals.map((m) => m.servings.STA)).toEqual([6, 0, 0, 0, 0]);
  });

  it('un reparto a mano tiene un valor por tiempo y suma el total del día del grupo', () => {
    expect(problems({ ...DRAFT, splitOverrides: { MILK: [1, 1, 0, 0, 0], FRU: [3] } })).toEqual([
      'Frutas: el reparto necesita un valor por cada uno de los 5 tiempos de comida (RN-E09).',
      'Lácteos: el reparto suma 2 y el total del día es 3 (RN-E09).',
    ]);
  });
});

describe('RN-G05 · alimentos permitidos por tiempo y grupo', () => {
  it('solo en un grupo con intercambios en ese tiempo, y sin repetir el alimento en el mismo grupo', () => {
    const meals = [
      {
        ...meal(0),
        allowedFoods: [
          { groupCode: 'STA' as const, foodId: RICE, grams: 30, householdText: null },
          { groupCode: 'STA' as const, foodId: RICE, grams: 40, householdText: null },
        ],
      },
      {
        ...meal(1),
        allowedFoods: [
          { groupCode: 'MEAT' as const, foodId: CHICKEN, grams: 35, householdText: null },
        ],
      },
      ...DEFAULT_MEALS.slice(2),
    ];

    expect(problems({ ...DRAFT, meals })).toEqual([
      'Desayuno: un alimento se repite en Almidones.',
      'Media mañana: Carnes magras no tiene intercambios en este tiempo; quita sus alimentos permitidos (RN-G05).',
    ]);
  });
});

describe('RN-E13 · RN-G05 · lo que falta para publicar', () => {
  it('la meta de hidratación y al menos un alimento permitido por grupo con intercambios en cada tiempo', () => {
    const plan = exchangePlan(
      {
        ...DRAFT,
        fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
        meals: [{ ...meal(0), sharePct: 100 }],
      },
      {
        automaticServings: { VEG: 0, FRU: 0, MILK: 0, STA: 2, MEAT: 1, FAT: 0 },
        split: (total) => [total],
      },
      NAMES,
    );
    if (!plan.ok) throw new Error('El borrador debía ser válido.');

    expect(publishProblems(plan.value, NAMES)).toEqual([
      'Falta la meta de hidratación (RN-E13).',
      'Desayuno: falta al menos un alimento permitido de Almidones (RN-G05).',
      'Desayuno: falta al menos un alimento permitido de Carnes magras (RN-G05).',
    ]);

    const ready = exchangePlan(
      {
        ...DRAFT,
        fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
        hydrationTargetMl: 2_500,
        meals: [
          {
            ...meal(0),
            sharePct: 100,
            allowedFoods: [
              { groupCode: 'STA', foodId: RICE, grams: 30, householdText: '¼ taza' },
              { groupCode: 'MEAT', foodId: CHICKEN, grams: 35, householdText: null },
            ],
          },
        ],
      },
      {
        automaticServings: { VEG: 0, FRU: 0, MILK: 0, STA: 2, MEAT: 1, FAT: 0 },
        split: (total) => [total],
      },
      NAMES,
    );
    expect(ready.ok && publishProblems(ready.value, NAMES)).toEqual([]);
  });
});
