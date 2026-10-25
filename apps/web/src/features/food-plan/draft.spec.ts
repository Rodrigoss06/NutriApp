import { describe, expect, it } from 'vitest';
import { GRAMS } from '@/features/recipe/draft';
import {
  compositionBody,
  compositionDraftOf,
  foodItemOf,
  itemError,
  menuBody,
  menuDraftOf,
  pickedRecipeRow,
  withCellItems,
  withDayCopiedToAll,
  withHeaderChange,
  withItemChange,
  withMenuMeal,
  withoutMenuMeal,
  type FoodItemRow,
  type ItemRow,
  type MenuDraft,
} from './draft';

const RICE = '0192a000-0000-7000-8000-000000000001';
const STEW = '0192a000-0000-7000-8000-000000000002';
const CUP = { id: '0192a000-0000-7000-8000-000000000003', name: 'Taza', grams: 160 };

const rice = (change: Partial<FoodItemRow> = {}): FoodItemRow => ({
  kind: 'FOOD',
  key: 'arroz',
  foodId: RICE,
  foodName: 'Arroz cocido',
  foodState: 'COOKED',
  measures: [CUP],
  unit: GRAMS,
  amount: '150',
  savedHouseholdText: null,
  ...change,
});

const foodView = {
  itemType: 'FOOD' as const,
  foodId: RICE,
  foodName: 'Arroz cocido',
  state: 'COOKED' as const,
  grams: 150,
  householdText: '1 taza',
  nutrientsPer100g: {},
};

describe('RF-20 · RN-E12 · alimentos en gramos o en medidas caseras', () => {
  it('con una medida, los gramos son los de la medida por la cantidad', () => {
    expect(foodItemOf(rice({ unit: CUP.id, amount: '1.5' }))).toEqual({
      grams: 240,
      householdText: '1.5 × Taza',
    });
  });

  it('en gramos conserva la medida con que se guardó, hasta que se cambia la cantidad', () => {
    const saved = rice({ savedHouseholdText: '1 taza' });
    expect(foodItemOf(saved)).toEqual({ grams: 150, householdText: '1 taza' });
    const [changed] = withItemChange([saved], 'arroz', { amount: '200' });
    expect(changed && foodItemOf(changed)).toEqual({ grams: 200, householdText: null });
  });

  it('una cantidad que no sirve dice por qué', () => {
    expect(itemError(rice({ amount: '0' }))).toBe('Más de 0 y hasta 9999 g.');
    expect(itemError(rice({ unit: CUP.id, amount: '101' }))).toBe('Más de 0 y hasta 100.');
    expect(itemError({ ...pickedRecipeRow({ id: STEW, name: 'Guiso' }, 'g'), servings: '0' })).toBe(
      'Más de 0 y hasta 99.',
    );
  });
});

describe('RF-20 · borrador por composición', () => {
  const plan = {
    meals: [
      {
        id: 'almuerzo',
        slotCode: 'LUNCH' as const,
        name: 'Almuerzo',
        timeOfDay: '13:00',
        sharePct: 100,
        items: [foodView],
        totals: { ingredientCount: 1, nutrients: {} },
      },
    ],
    hydrationTargetMl: 2000,
    instructions: null,
  };

  it('lo guardado vuelve igual en el cuerpo', () => {
    expect(compositionBody(compositionDraftOf(plan))).toEqual({
      modality: 'COMPOSITION',
      meals: [
        {
          slotCode: 'LUNCH',
          name: 'Almuerzo',
          timeOfDay: '13:00',
          sharePct: 100,
          items: [{ itemType: 'FOOD', foodId: RICE, grams: 150, householdText: '1 taza' }],
        },
      ],
      hydrationTargetMl: 2000,
      instructions: null,
    });
  });

  it('las medidas del alimento llegan al borrador para cambiar la cantidad', () => {
    expect(compositionDraftOf(plan, { [RICE]: [CUP] }).meals[0]?.items[0]?.measures).toEqual([CUP]);
  });

  it('sin nombre, con un % que no es número o una hidratación que no sirve, no hay cuerpo', () => {
    const draft = compositionDraftOf(plan);
    expect(compositionBody(withHeaderChange(draft, 'almuerzo', { name: ' ' }))).toBeNull();
    expect(compositionBody(withHeaderChange(draft, 'almuerzo', { sharePct: 'x' }))).toBeNull();
    expect(compositionBody({ ...draft, hydrationMl: '0' })).toBeNull();
  });
});

const emptyMenu = (): MenuDraft => ({
  meals: [
    { key: 'desayuno', slotCode: 'BREAKFAST', name: 'Desayuno', timeOfDay: '', sharePct: '40' },
    { key: 'almuerzo', slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: '', sharePct: '60' },
  ],
  days: Array.from({ length: 7 }, () => ({
    cells: [
      { optionA: [], optionB: [] },
      { optionA: [], optionB: [] },
    ],
  })),
  hydrationMl: '',
  instructions: '',
});

describe('RF-21 · RN-E16 · borrador del menú semanal', () => {
  it('lo guardado vuelve igual en el cuerpo, con recetas en porciones y las dos opciones', () => {
    const plan = {
      meals: [{ slotCode: 'LUNCH' as const, name: 'Almuerzo', timeOfDay: null, sharePct: 100 }],
      days: Array.from({ length: 7 }, (_, d) => ({
        dayOfWeek: d + 1,
        meals: [
          {
            id: `celda-${String(d)}`,
            optionA: [
              {
                itemType: 'RECIPE' as const,
                recipeId: STEW,
                recipeName: 'Guiso',
                servings: 1.5,
                nutrientsPerServing: {},
              },
            ],
            optionB: [foodView],
            totalsA: null,
            totalsB: null,
          },
        ],
        totals: { ingredientCount: 0, nutrients: {} },
      })),
      hydrationTargetMl: null,
      instructions: 'Variar las frutas.',
    };
    const body = menuBody(menuDraftOf(plan));
    expect(body?.days).toHaveLength(7);
    expect(body?.days[6]?.meals[0]).toEqual({
      optionA: [{ itemType: 'RECIPE', recipeId: STEW, servings: 1.5 }],
      optionB: [{ itemType: 'FOOD', foodId: RICE, grams: 150, householdText: '1 taza' }],
    });
    expect(body?.instructions).toBe('Variar las frutas.');
  });

  it('un tiempo nuevo agrega una celda a cada día; quitarlo quita la suya de cada día', () => {
    const added = withMenuMeal(emptyMenu(), 'cena');
    expect(added.days.every((day) => day.cells.length === 3)).toBe(true);
    const withRecipe = withCellItems(added, 3, 1, 'optionA', () => [
      pickedRecipeRow({ id: STEW, name: 'Guiso' }, 'g'),
    ]);
    const removed = withoutMenuMeal(withRecipe, 'desayuno');
    expect(removed.meals.map((m) => m.key)).toEqual(['almuerzo', 'cena']);
    expect(removed.days[3]?.cells[0]?.optionA).toHaveLength(1);
  });

  it('copiar un día a los demás deja los siete iguales, con filas propias', () => {
    let next = 0;
    const filled = withCellItems(emptyMenu(), 0, 1, 'optionA', () => [rice()]);
    const copied = withDayCopiedToAll(filled, 0, () => `fila-${String((next += 1))}`);
    const foodOf = (row: ItemRow | undefined) => (row?.kind === 'FOOD' ? row.foodId : null);
    expect(copied.days.map((day) => foodOf(day.cells[1]?.optionA[0]))).toEqual(
      Array.from({ length: 7 }, () => RICE),
    );
    const keys = copied.days.map((day) => day.cells[1]?.optionA[0]?.key);
    expect(new Set(keys).size).toBe(7);
    expect(menuBody({ ...copied, hydrationMl: '2000' })?.days[5]?.meals[1]?.optionA).toEqual([
      { itemType: 'FOOD', foodId: RICE, grams: 150, householdText: null },
    ]);
  });
});
