import type { RecipeDetail } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  draftErrors,
  draftOf,
  GRAMS,
  requestOf,
  type IngredientRow,
  type RecipeDraft,
} from './draft';

const RICE = '0192a000-0000-7000-8000-000000000001';
const CHICKEN = '0192a000-0000-7000-8000-000000000002';

const row = (change: Partial<IngredientRow> = {}): IngredientRow => ({
  key: 'r1',
  foodId: RICE,
  foodName: 'Arroz pilado o pulido cocido',
  foodState: 'COOKED',
  measures: [{ id: 'taza', name: 'Taza de acero al ras', grams: 203.8 }],
  unit: GRAMS,
  amount: '200',
  savedHouseholdText: null,
  ...change,
});

const DRAFT: RecipeDraft = {
  name: ' Arroz con pollo ',
  servings: '2',
  cookedWeightG: '',
  tags: 'almuerzo, pollo, ',
  instructions: '',
  ingredients: [row()],
};

describe('RF-21 · RN-E12 · el formulario de una receta', () => {
  it('el pedido: textos limpios, lo vacío es null y las etiquetas van separadas por comas', () => {
    expect(requestOf(DRAFT)).toEqual({
      name: 'Arroz con pollo',
      servings: 2,
      cookedWeightG: null,
      instructions: null,
      tags: ['almuerzo', 'pollo'],
      ingredients: [{ foodId: RICE, grams: 200, householdText: null }],
    });
  });

  it('una medida casera aporta sus gramos por la cantidad, y queda escrita como se ingresó', () => {
    const request = requestOf({
      ...DRAFT,
      ingredients: [row({ unit: 'taza', amount: '0,5' })],
    });
    expect(request?.ingredients).toEqual([
      { foodId: RICE, grams: 101.9, householdText: '0.5 × Taza de acero al ras' },
    ]);
  });

  it('lo que no se puede calcular no viaja: el formulario dice qué falta', () => {
    const draft = {
      ...DRAFT,
      name: 'A',
      servings: '0',
      cookedWeightG: 'mucho',
      ingredients: [row({ amount: '' })],
    };
    expect(requestOf(draft)).toBeNull();
    expect(draftErrors(draft)).toEqual({
      name: 'Escribe el nombre: 2 letras o más.',
      servings: 'Más de 0 y hasta 1,000 porciones.',
      cookedWeightG: 'Déjalo vacío o escribe los gramos: más de 0.',
      ingredients: { r1: 'Más de 0 g.' },
    });
    expect(draftErrors({ ...DRAFT, ingredients: [] })).toEqual({
      list: 'Agrega al menos un ingrediente.',
    });
  });

  it('al editar, cada ingrediente vuelve en gramos con la medida con que se guardó', () => {
    const recipe = {
      name: 'Arroz con pollo',
      servings: 2,
      cookedWeightG: 500,
      instructions: 'Graneado.',
      tags: ['almuerzo'],
      ingredients: [
        {
          position: 1,
          foodId: CHICKEN,
          name: 'Pollo, carne pulpa',
          sourceCode: 'TPCA_2017',
          state: 'RAW',
          own: false,
          grams: 150,
          householdText: '1 presa',
        },
      ],
    } as unknown as RecipeDetail;
    const draft = draftOf(recipe, { [CHICKEN]: [] });

    expect(draft).toMatchObject({
      name: 'Arroz con pollo',
      servings: '2',
      cookedWeightG: '500',
      tags: 'almuerzo',
      instructions: 'Graneado.',
      ingredients: [
        {
          foodId: CHICKEN,
          foodState: 'RAW',
          unit: GRAMS,
          amount: '150',
          savedHouseholdText: '1 presa',
        },
      ],
    });
    expect(requestOf(draft)?.ingredients).toEqual([
      { foodId: CHICKEN, grams: 150, householdText: '1 presa' },
    ]);
  });
});
