import type { NutritionPlan } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  draftOf,
  planBody,
  withFood,
  withManualSplit,
  withMeal,
  without,
  withoutMeal,
  type PlanDraft,
} from './draft';

const RICE = '00000000-0000-4000-8000-0000000000a1';
const servings = (STA: number, MEAT: number) => ({ VEG: 1, FRU: 1, MILK: 1, STA, MEAT, FAT: 1 });
const meal = (id: string, name: string, sharePct: number, sta: number, meat: number) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  slotCode: 'CUSTOM' as const,
  name,
  timeOfDay: null,
  sharePct,
  servings: servings(sta, meat),
  allowedFoods: [],
});

/** G-18 y G-19 con el ajuste de carnes a 15, el reparto de lácteos a mano y arroz en el almuerzo. */
const plan: Pick<
  NutritionPlan,
  'exchanges' | 'manualSplit' | 'meals' | 'hydrationTargetMl' | 'instructions'
> = {
  exchanges: [
    { groupCode: 'VEG', servings: 4, automatic: 4, manual: false },
    { groupCode: 'FRU', servings: 3, automatic: 3, manual: false },
    { groupCode: 'MILK', servings: 3, automatic: 3, manual: false },
    { groupCode: 'STA', servings: 6, automatic: 6, manual: false },
    { groupCode: 'MEAT', servings: 15, automatic: 16, manual: true },
    { groupCode: 'FAT', servings: 3, automatic: 3, manual: false },
  ],
  manualSplit: ['MILK'],
  meals: [
    { ...meal('1', 'Desayuno', 25, 1, 4), servings: { ...servings(1, 4), MILK: 1 } },
    { ...meal('2', 'Media mañana', 10, 1, 2), servings: { ...servings(1, 2), MILK: 0 } },
    {
      ...meal('3', 'Almuerzo', 35, 2, 5),
      timeOfDay: '13:00',
      servings: { ...servings(2, 5), MILK: 0 },
      allowedFoods: [
        {
          groupCode: 'STA',
          foodId: RICE,
          foodName: 'Arroz cocido',
          grams: 50,
          householdText: '½ taza',
          nutrientsPer100g: { CHOCDF: 30 },
        },
      ],
    },
    { ...meal('4', 'Media tarde', 10, 1, 2), servings: { ...servings(1, 2), MILK: 1 } },
    { ...meal('5', 'Cena', 20, 1, 2), servings: { ...servings(1, 2), MILK: 1 } },
  ],
  hydrationTargetMl: null,
  instructions: null,
};

const valid = (draft: PlanDraft) => {
  const body = planBody(draft);
  if (!body) throw new Error('Se esperaba un cuerpo.');
  return body;
};

describe('RF-19 · el editor arma el borrador entero para PUT', () => {
  it('lo leído vuelve igual: grupos fijos, ajuste a mano, reparto a mano, tiempos y alimentos', () => {
    const body = valid(draftOf(plan));
    expect(body.fixedServings).toEqual({ VEG: 4, FRU: 3, MILK: 3 });
    expect(body.overrides).toEqual({ MEAT: 15 });
    expect(body.splitOverrides).toEqual({ MILK: [1, 0, 0, 1, 1] });
    expect(body.meals.map((m) => [m.name, m.timeOfDay, m.sharePct])).toEqual([
      ['Desayuno', null, 25],
      ['Media mañana', null, 10],
      ['Almuerzo', '13:00', 35],
      ['Media tarde', null, 10],
      ['Cena', null, 20],
    ]);
    expect(body.meals[2]?.allowedFoods).toEqual([
      { groupCode: 'STA', foodId: RICE, grams: 50, householdText: '½ taza' },
    ]);
    expect(body.hydrationTargetMl).toBeNull();
    expect(body.instructions).toBeNull();
  });

  it('RN-E08 · almidones, carnes y grasas sin ajuste los da el método: no van en overrides', () => {
    const draft = draftOf(plan);
    expect(valid({ ...draft, overrides: without(draft.overrides, 'MEAT') }).overrides).toEqual({});
  });

  it('RN-E09 · el reparto a mano tiene un valor por tiempo al agregar o quitar uno', () => {
    let draft = withManualSplit(draftOf(plan), 'STA', [1, 1, 2, 1, 1]);
    draft = withMeal(draft, 'nuevo');
    expect(draft.meals).toHaveLength(6);
    expect(draft.split.STA).toEqual(['1', '1', '2', '1', '1', '0']);
    expect(draft.split.MILK).toEqual(['1', '0', '0', '1', '1', '0']);
    draft = withoutMeal(draft, draft.meals[1]?.key ?? '');
    expect(draft.split.STA).toEqual(['1', '2', '1', '1', '0']);
    expect(withManualSplit(draft, 'STA', null).split.STA).toBeUndefined();
  });

  it('un tiempo nuevo empieza sin nombre ni porcentaje, y un alimento no se repite en el mismo grupo (RN-G05)', () => {
    const draft = withMeal(draftOf(plan), 'nuevo');
    expect(draft.meals[5]).toMatchObject({ slotCode: 'CUSTOM', name: '', sharePct: '0' });
    expect(planBody(draft)).toBeNull();
    const rice = {
      groupCode: 'STA' as const,
      foodId: RICE,
      foodName: 'Arroz cocido',
      grams: '50',
      householdText: '',
      nutrientsPer100g: {},
    };
    const lunch = draft.meals[2]?.key ?? '';
    expect(withFood(draft, lunch, rice).meals[2]?.foods).toHaveLength(1);
  });

  it('acepta la coma decimal; sin un número válido no hay cuerpo', () => {
    const draft = draftOf(plan);
    const lunch = draft.meals[2];
    if (!lunch) throw new Error('falta el almuerzo');
    const comma = {
      ...draft,
      meals: draft.meals.map((m) =>
        m.key === lunch.key
          ? { ...m, sharePct: '35,0', foods: m.foods.map((f) => ({ ...f, grams: '50,5' })) }
          : m,
      ),
      hydrationMl: '2500',
      instructions: '  Tomar agua entre comidas.  ',
    };
    const body = valid(comma);
    expect(body.meals[2]?.sharePct).toBe(35);
    expect(body.meals[2]?.allowedFoods[0]?.grams).toBe(50.5);
    expect(body.hydrationTargetMl).toBe(2500);
    expect(body.instructions).toBe('Tomar agua entre comidas.');

    for (const broken of [
      { ...draft, fixed: { ...draft.fixed, VEG: '' } },
      { ...draft, fixed: { ...draft.fixed, VEG: '2.5' } },
      { ...draft, overrides: { MEAT: '100' } },
      { ...draft, hydrationMl: '2,5' },
      { ...draft, meals: draft.meals.map((m, i) => (i === 0 ? { ...m, timeOfDay: '25:00' } : m)) },
      {
        ...draft,
        meals: draft.meals.map((m, i) =>
          i === 2 ? { ...m, foods: m.foods.map((f) => ({ ...f, grams: '0' })) } : m,
        ),
      },
    ]) {
      expect(planBody(broken)).toBeNull();
    }
  });
});
