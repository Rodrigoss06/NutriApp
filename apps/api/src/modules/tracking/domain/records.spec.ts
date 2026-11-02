import { describe, expect, it } from 'vitest';
import {
  catalogFoodDraft,
  dayTotals,
  planDrafts,
  planView,
  recordWindow,
  type AppPlan,
  type LoggablePlan,
} from './records.js';

/** Un plan por intercambios como lo congela nutrition (RN-E15): lista de demostración y un desayuno. */
const EXCHANGES: LoggablePlan = {
  planId: 'plan-1',
  modality: 'EXCHANGES',
  exchangeList: {
    groups: [
      { code: 'STARCH', name: 'Almidones', choG: 15, proteinG: 2, fatG: 0, kcal: 70 },
      { code: 'MEAT', name: 'Carnes', choG: 0, proteinG: 7, fatG: 3, kcal: 55 },
    ],
  },
  meals: [
    {
      id: 'meal-breakfast',
      slotCode: 'BREAKFAST',
      name: 'Desayuno',
      servings: { STARCH: 1, MEAT: 2 },
      allowedFoods: [
        {
          groupCode: 'STARCH',
          foodId: 'food-bread',
          foodName: 'Pan integral',
          grams: 30,
          householdText: '1 rebanada',
        },
        {
          groupCode: 'MEAT',
          foodId: 'food-egg',
          foodName: 'Huevo',
          grams: 50,
          householdText: '1 unidad',
        },
      ],
    },
  ],
};

/** Por 100 g de parte comestible; null es «sin dato» (RN-I03). */
const OATS = {
  name: 'Avena',
  nutrientsPer100g: { ENERC_KCAL: 380, CHOCDF: 66, PROCNT: 13, FAT: 7, FE: 4.2, VITC: null },
};

const COMPOSITION: LoggablePlan = {
  planId: 'plan-2',
  modality: 'COMPOSITION',
  foods: {
    'food-oats': OATS,
    'food-quinoa': {
      name: 'Quinua',
      nutrientsPer100g: { ENERC_KCAL: 360, CHOCDF: null, PROCNT: 14, FAT: 6 },
    },
  },
  meals: [
    {
      id: 'meal-breakfast',
      slotCode: 'BREAKFAST',
      name: 'Desayuno',
      items: [
        {
          itemType: 'FOOD',
          foodId: 'food-oats',
          foodName: 'Avena',
          grams: 40,
          householdText: '4 cdas',
        },
        {
          itemType: 'FOOD',
          foodId: 'food-quinoa',
          foodName: 'Quinua',
          grams: 50,
          householdText: null,
        },
      ],
    },
  ],
};

const MENU: LoggablePlan = {
  planId: 'plan-3',
  modality: 'WEEKLY_MENU',
  foods: { 'food-oats': OATS },
  recipes: {
    'recipe-rice': {
      name: 'Arroz con pollo',
      perServing: {
        nutrients: {
          ENERC_KCAL: { value: 520 },
          CHOCDF: { value: 60 },
          PROCNT: { value: 30 },
          FAT: { value: null },
          FE: { value: 2 },
        },
      },
    },
  },
  meals: [{ slotCode: 'LUNCH', name: 'Almuerzo' }],
  days: [
    {
      dayOfWeek: 1,
      meals: [
        {
          id: 'cell-monday-lunch',
          optionA: [
            {
              itemType: 'RECIPE',
              recipeId: 'recipe-rice',
              recipeName: 'Arroz con pollo',
              servings: 1.5,
            },
            {
              itemType: 'FOOD',
              foodId: 'food-oats',
              foodName: 'Avena',
              grams: 20,
              householdText: null,
            },
          ],
          optionB: [],
        },
      ],
    },
  ],
};

describe('RN-G10 · la ventana de registros', () => {
  it('hoy y hasta N días atrás se puede; una fecha futura no; antes de la ventana, el día está cerrado', () => {
    expect(recordWindow('2026-11-01', '2026-11-01', 3)).toBe('OPEN');
    expect(recordWindow('2026-10-29', '2026-11-01', 3)).toBe('OPEN');
    expect(recordWindow('2026-10-28', '2026-11-01', 3)).toBe('CLOSED');
    expect(recordWindow('2026-11-02', '2026-11-01', 3)).toBe('FUTURE');
  });

  it('con 0 días, solo hoy; cruza meses y años', () => {
    expect(recordWindow('2026-10-31', '2026-11-01', 0)).toBe('CLOSED');
    expect(recordWindow('2026-12-30', '2027-01-02', 3)).toBe('OPEN');
  });
});

describe('RN-G05 · lo que se registra desde un plan por intercambios', () => {
  it('guía de dominio §7.1: los valores del grupo por porción, con la porción del tiempo por defecto', () => {
    const drafts = planDrafts(EXCHANGES, {
      kind: 'EXCHANGE',
      mealId: 'meal-breakfast',
      groupCode: 'MEAT',
      foodId: 'food-egg',
      servings: null,
    });

    expect(drafts).toEqual([
      {
        mealSlotCode: 'BREAKFAST',
        planMealId: 'meal-breakfast',
        itemType: 'EXCHANGE',
        itemId: 'food-egg',
        itemName: 'Huevo',
        exchangeGroupCode: 'MEAT',
        servings: 2,
        grams: 100,
        householdText: '1 unidad',
        nutrients: { kcal: 110, choG: 0, proteinG: 14, fatG: 6, micronutrients: {} },
        inPlan: true,
      },
    ]);
  });

  it('el paciente cambia la porción antes de registrar', () => {
    const [draft] =
      planDrafts(EXCHANGES, {
        kind: 'EXCHANGE',
        mealId: 'meal-breakfast',
        groupCode: 'STARCH',
        foodId: 'food-bread',
        servings: 1.5,
      }) ?? [];

    expect(draft).toMatchObject({ servings: 1.5, grams: 45, nutrients: { kcal: 105, choG: 22.5 } });
  });

  it('un alimento que no está permitido en ese tiempo y grupo no está en el plan', () => {
    expect(
      planDrafts(EXCHANGES, {
        kind: 'EXCHANGE',
        mealId: 'meal-breakfast',
        groupCode: 'STARCH',
        foodId: 'food-egg',
        servings: null,
      }),
    ).toBeNull();
    expect(
      planDrafts(EXCHANGES, {
        kind: 'EXCHANGE',
        mealId: 'meal-dinner',
        groupCode: 'MEAT',
        foodId: 'food-egg',
        servings: null,
      }),
    ).toBeNull();
  });
});

describe('RN-G05 · RN-I03 · lo que se registra desde una composición', () => {
  it('por 100 g de parte comestible × gramos, con los gramos del plan por defecto y los micronutrientes conocidos', () => {
    const [draft] =
      planDrafts(COMPOSITION, {
        kind: 'FOOD',
        mealId: 'meal-breakfast',
        foodId: 'food-oats',
        grams: null,
      }) ?? [];

    expect(draft).toMatchObject({
      itemType: 'FOOD',
      itemId: 'food-oats',
      itemName: 'Avena',
      servings: null,
      grams: 40,
      householdText: '4 cdas',
      inPlan: true,
    });
    expect(draft?.nutrients.kcal).toBeCloseTo(152, 10);
    expect(draft?.nutrients.choG).toBeCloseTo(26.4, 10);
    expect(draft?.nutrients.micronutrients).toEqual({ FE: expect.closeTo(1.68, 10) as number });
  });

  it('un nutriente sin dato queda sin dato, no en cero', () => {
    const [draft] =
      planDrafts(COMPOSITION, {
        kind: 'FOOD',
        mealId: 'meal-breakfast',
        foodId: 'food-quinoa',
        grams: 100,
      }) ?? [];

    expect(draft?.nutrients).toMatchObject({ kcal: 360, choG: null, proteinG: 14, fatG: 6 });
  });
});

describe('RN-G05 · lo que se registra desde el menú semanal', () => {
  it('la opción del día, cada alimento o receta con lo suyo; la receta por porción × porciones', () => {
    const drafts = planDrafts(MENU, {
      kind: 'MENU',
      mealId: 'cell-monday-lunch',
      option: 'A',
    });

    expect(drafts).toHaveLength(2);
    expect(drafts?.[0]).toMatchObject({
      mealSlotCode: 'LUNCH',
      planMealId: 'cell-monday-lunch',
      itemType: 'RECIPE',
      itemId: 'recipe-rice',
      itemName: 'Arroz con pollo',
      servings: 1.5,
      grams: null,
      nutrients: { kcal: 780, choG: 90, proteinG: 45, fatG: null, micronutrients: { FE: 3 } },
    });
    expect(drafts?.[1]).toMatchObject({ itemType: 'FOOD', grams: 20 });
  });

  it('una opción vacía no se registra', () => {
    expect(planDrafts(MENU, { kind: 'MENU', mealId: 'cell-monday-lunch', option: 'B' })).toBeNull();
  });
});

describe('RN-G05 · fuera del plan, desde el catálogo', () => {
  it('queda marcado fuera del plan, con los nutrientes del catálogo por gramos', () => {
    const draft = catalogFoodDraft(
      { id: 'food-oats', ...OATS },
      { mealSlotCode: 'SNACK_PM', grams: 50 },
    );

    expect(draft).toMatchObject({
      mealSlotCode: 'SNACK_PM',
      planMealId: null,
      itemType: 'FOOD',
      itemId: 'food-oats',
      itemName: 'Avena',
      grams: 50,
      inPlan: false,
      nutrients: { kcal: 190, choG: 33, proteinG: 6.5, fatG: 3.5 },
    });
  });
});

describe('RN-G09 · RN-I03 · el total del día', () => {
  it('suma lo conocido y cuenta en cuántos registros falta cada nutriente', () => {
    const totals = dayTotals([
      { kcal: 110, choG: 0, proteinG: 14, fatG: 6 },
      { kcal: 360, choG: null, proteinG: 14, fatG: 6 },
    ]);

    expect(totals).toEqual({
      kcal: { value: 470, known: 470, missing: 0 },
      choG: { value: null, known: 0, missing: 1 },
      proteinG: { value: 28, known: 28, missing: 0 },
      fatG: { value: 12, known: 12, missing: 0 },
    });
  });

  it('sin registros, cero en todo', () => {
    expect(dayTotals([]).kcal).toEqual({ value: 0, known: 0, missing: 0 });
  });
});

describe('RF-28 · RN-G06 · el plan en la app, listo para registrar', () => {
  const meta = {
    versionNo: 2,
    validFrom: '2026-10-30',
    hydrationTargetMl: 2_000,
    instructions: 'Toma agua entre comidas.',
  };

  it('intercambios: cada grupo del tiempo con sus porciones y sus alimentos permitidos, en el orden de la lista', () => {
    const plan: AppPlan = {
      ...meta,
      planId: 'plan-1',
      modality: 'EXCHANGES',
      exchangeList: {
        groups: [
          { code: 'STA', name: 'Almidones', choG: 15, proteinG: 2, fatG: 0, kcal: 70 },
          { code: 'FRU', name: 'Frutas', choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
          { code: 'MEAT', name: 'Carnes', choG: 0, proteinG: 7, fatG: 3, kcal: 55 },
        ],
      },
      meals: [
        {
          id: 'meal-breakfast',
          slotCode: 'BREAKFAST',
          name: 'Desayuno',
          timeOfDay: '07:30',
          servings: { MEAT: 2, STA: 1, FRU: 0 },
          allowedFoods: [
            {
              groupCode: 'MEAT',
              foodId: 'egg',
              foodName: 'Huevo',
              grams: 50,
              householdText: '1 unidad',
            },
            { groupCode: 'STA', foodId: 'bread', foodName: 'Pan', grams: 30, householdText: null },
          ],
        },
      ],
    };

    expect(planView(plan, '2026-11-01')).toEqual({
      ...meta,
      planId: 'plan-1',
      modality: 'EXCHANGES',
      meals: [
        {
          id: 'meal-breakfast',
          slotCode: 'BREAKFAST',
          name: 'Desayuno',
          timeOfDay: '07:30',
          options: [
            {
              kind: 'EXCHANGE',
              groupCode: 'STA',
              groupName: 'Almidones',
              servings: 1,
              foods: [
                { foodId: 'bread', foodName: 'Pan', gramsPerServing: 30, householdText: null },
              ],
            },
            {
              kind: 'EXCHANGE',
              groupCode: 'MEAT',
              groupName: 'Carnes',
              servings: 2,
              foods: [
                {
                  foodId: 'egg',
                  foodName: 'Huevo',
                  gramsPerServing: 50,
                  householdText: '1 unidad',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('menú semanal: las opciones del día de la semana pedido, con la celda como id', () => {
    const plan: AppPlan = {
      ...meta,
      planId: 'plan-3',
      modality: 'WEEKLY_MENU',
      foods: {},
      recipes: {},
      meals: [{ slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: '13:00' }],
      days: [
        {
          dayOfWeek: 1,
          meals: [
            {
              id: 'cell-monday',
              optionA: [
                {
                  itemType: 'RECIPE',
                  recipeId: 'rice',
                  recipeName: 'Arroz con pollo',
                  servings: 1,
                },
              ],
              optionB: [
                {
                  itemType: 'FOOD',
                  foodId: 'oats',
                  foodName: 'Avena',
                  grams: 40,
                  householdText: null,
                },
              ],
            },
          ],
        },
        { dayOfWeek: 2, meals: [{ id: 'cell-tuesday', optionA: [], optionB: [] }] },
      ],
    };

    const monday = planView(plan, '2026-11-02');
    expect(monday.meals).toEqual([
      {
        id: 'cell-monday',
        slotCode: 'LUNCH',
        name: 'Almuerzo',
        timeOfDay: '13:00',
        options: [
          {
            kind: 'MENU',
            option: 'A',
            items: [{ name: 'Arroz con pollo', grams: null, servings: 1, householdText: null }],
          },
          {
            kind: 'MENU',
            option: 'B',
            items: [{ name: 'Avena', grams: 40, servings: null, householdText: null }],
          },
        ],
      },
    ]);
    expect(planView(plan, '2026-11-03').meals[0]?.options).toEqual([]);
  });
});
