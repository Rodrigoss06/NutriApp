import { describe, expect, it } from 'vitest';
import { ownFood, type NutrientDefinition, type OwnFoodInput } from './own-food.js';

/** Un recorte del catálogo food.nutrient, en su orden. */
const CATALOG: readonly NutrientDefinition[] = [
  { code: 'ENERC_KCAL', unit: 'kcal' },
  { code: 'PROCNT', unit: 'g' },
  { code: 'FAT', unit: 'g' },
  { code: 'CHOCDF', unit: 'g' },
  { code: 'FIBTG', unit: 'g' },
  { code: 'CA', unit: 'mg' },
];

/** Un pan de la casa, sintético. */
const BREAD: OwnFoodInput = {
  name: 'Pan de la casa',
  state: 'READY',
  ediblePortionPct: 100,
  nutrients: { ENERC_KCAL: 270, PROCNT: 8.5, FAT: 2, CHOCDF: 55, CA: null },
  measures: [{ name: 'Unidad', grams: 40 }],
};

const problems = (input: OwnFoodInput): unknown => {
  const result = ownFood(input, CATALOG);
  return result.ok ? [] : result.error.details?.problems;
};

describe('RN-I01 · RN-I03 · alimento propio de la organización', () => {
  it('guarda todos los nutrientes del catálogo: lo que no se envía, o null, queda «sin dato», distinto de cero', () => {
    const result = ownFood({ ...BREAD, nutrients: { ...BREAD.nutrients, FAT: 0 } }, CATALOG);

    expect(result.ok && result.value.nutrients).toEqual([
      { nutrientCode: 'ENERC_KCAL', valuePer100g: 270, flag: null },
      { nutrientCode: 'PROCNT', valuePer100g: 8.5, flag: null },
      { nutrientCode: 'FAT', valuePer100g: 0, flag: null },
      { nutrientCode: 'CHOCDF', valuePer100g: 55, flag: null },
      { nutrientCode: 'FIBTG', valuePer100g: null, flag: 'MISSING' },
      { nutrientCode: 'CA', valuePer100g: null, flag: 'MISSING' },
    ]);
    expect(result.ok && result.value).toMatchObject({
      name: 'Pan de la casa',
      state: 'READY',
      ediblePortionPct: 100,
      measures: [{ name: 'Unidad', grams: 40 }],
    });
  });

  it('un nutriente que no está en el catálogo se rechaza', () => {
    const result = ownFood({ ...BREAD, nutrients: { ...BREAD.nutrients, SUGAR: 3 } }, CATALOG);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({ code: 'NC-FOOD-001', rule: 'RN-I03' });
    expect(problems({ ...BREAD, nutrients: { SUGAR: 3, ENERC_KCAL: 1 } })).toEqual([
      'SUGAR no es un nutriente del catálogo.',
    ]);
  });

  it('nada cabe más allá de 100 g: ni un nutriente sobre su máximo ni macronutrientes que sumen más', () => {
    expect(problems({ ...BREAD, nutrients: { ENERC_KCAL: 950, PROCNT: 101 } })).toEqual([
      'ENERC_KCAL: 950 kcal no cabe en 100 g (máximo 900).',
      'PROCNT: 101 g no cabe en 100 g (máximo 100).',
    ]);
    expect(problems({ ...BREAD, nutrients: { PROCNT: 40, FAT: 30, CHOCDF: 35 } })).toEqual([
      'Proteínas, grasa y carbohidratos suman 105 g en 100 g.',
    ]);
  });

  it('sin ningún nutriente no sirve para calcular', () => {
    expect(problems({ ...BREAD, nutrients: { CA: null } })).toEqual([
      'Ingresa al menos un nutriente por 100 g.',
    ]);
  });

  it('dos medidas con el mismo nombre se confunden: se rechazan, sin importar tildes ni mayúsculas', () => {
    expect(
      problems({
        ...BREAD,
        measures: [
          { name: 'Porción', grams: 50 },
          { name: 'porcion', grams: 80 },
        ],
      }),
    ).toEqual(['Dos medidas se llaman «porcion».']);
  });
});
