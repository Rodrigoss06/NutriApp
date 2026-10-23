import { describe, expect, it } from 'vitest';
import { DEFINING_MACRO, hydrationReferences, suggestedGrams } from './portion';

const DEMO = {
  VEG: { choG: 5, proteinG: 2, fatG: 0 },
  FRU: { choG: 15, proteinG: 0, fatG: 0 },
  MILK: { choG: 12, proteinG: 8, fatG: 0 },
  STA: { choG: 15, proteinG: 3, fatG: 1 },
  MEAT: { choG: 0, proteinG: 7, fatG: 2 },
  FAT: { choG: 0, proteinG: 0, fatG: 5 },
} as const;

describe('ADR-057 · gramos sugeridos de un alimento permitido', () => {
  it('cada grupo se define por un macronutriente: con la lista DEMO, 5, 15, 8, 15, 7 y 5 g', () => {
    const grams = Object.fromEntries(
      (Object.keys(DEMO) as (keyof typeof DEMO)[]).map((code) => [
        code,
        DEMO[code][DEFINING_MACRO[code].macro],
      ]),
    );
    expect(grams).toEqual({ VEG: 5, FRU: 15, MILK: 8, STA: 15, MEAT: 7, FAT: 5 });
    expect(DEFINING_MACRO.MILK.nutrient).toBe('PROCNT');
  });

  it('lo que aporta un intercambio ÷ ese macronutriente por 100 g del alimento × 100', () => {
    // Arroz cocido con 30 g de carbohidratos por 100 g: un almidón (15 g) son 50 g.
    expect(suggestedGrams('STA', DEMO.STA, { CHOCDF: 30, PROCNT: 2.4 })).toBeCloseTo(50, 9);
    // Pollo con 20 g de proteína por 100 g: una carne (7 g) son 35 g.
    expect(suggestedGrams('MEAT', DEMO.MEAT, { PROCNT: 20, FAT: 5 })).toBeCloseTo(35, 9);
    // Leche con 3.2 g de proteína por 100 g: un lácteo (8 g) son 250 g.
    expect(suggestedGrams('MILK', DEMO.MILK, { PROCNT: 3.2, CHOCDF: 4.8 })).toBeCloseTo(250, 9);
    expect(suggestedGrams('FAT', DEMO.FAT, { FAT: 100 })).toBeCloseTo(5, 9);
  });

  it('RN-I03 · sin dato o sin ese macronutriente no hay sugerencia', () => {
    expect(suggestedGrams('FRU', DEMO.FRU, { CHOCDF: null })).toBeNull();
    expect(suggestedGrams('FRU', DEMO.FRU, {})).toBeNull();
    expect(suggestedGrams('FAT', DEMO.FAT, { FAT: 0 })).toBeNull();
  });
});

describe('RN-E13 · referencias para la meta de hidratación', () => {
  it('ingestas adecuadas de agua total de EFSA 2010 e IOM 2004 según el sexo, sin valor por defecto', () => {
    expect(hydrationReferences('F')).toEqual([
      { source: 'EFSA 2010', ml: 2_000 },
      { source: 'IOM 2004', ml: 2_700 },
    ]);
    expect(hydrationReferences('M')).toEqual([
      { source: 'EFSA 2010', ml: 2_500 },
      { source: 'IOM 2004', ml: 3_700 },
    ]);
  });
});
