import { describe, expect, it } from 'vitest';
import type { CompositionDraft, WeeklyMenuDraft } from '../domain/food-plan.js';
import { calculateComposition, calculateWeeklyMenu } from './food-plan-calculation.js';
import {
  CHICKEN,
  cell,
  EGG,
  food,
  MENU,
  RICE,
  SOURCES,
  STEW,
  TARGETS,
} from './food-plan.spec-support.js';

const COMPOSITION: CompositionDraft = {
  meals: [
    {
      slotCode: 'BREAKFAST',
      name: 'Desayuno',
      timeOfDay: null,
      sharePct: 50,
      items: [food(EGG, 100)],
    },
    {
      slotCode: 'LUNCH',
      name: 'Almuerzo',
      timeOfDay: null,
      sharePct: 50,
      items: [food(RICE, 200), food(CHICKEN, 150)],
    },
  ],
  hydrationTargetMl: 2000,
  instructions: null,
};

const composition = (draft = COMPOSITION) => {
  const result = calculateComposition(draft, TARGETS, SOURCES, [90, 110]);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('RN-E16 · dieta por composición: suma ponderada por 100 g de parte comestible', () => {
  it('cada tiempo y el día suman gramos × valor por 100 g ÷ 100', () => {
    const { meals, totals } = composition();
    expect(meals[0]?.nutrients.ENERC_KCAL).toEqual({ value: 140, known: 140, missing: 0 });
    // 200 × 120 ÷ 100 + 150 × 110 ÷ 100 = 405 kcal; proteínas 4 + 30.
    expect(meals[1]?.nutrients.ENERC_KCAL?.value).toBeCloseTo(405, 10);
    expect(meals[1]?.nutrients.PROCNT?.value).toBeCloseTo(34, 10);
    expect(totals.ingredientCount).toBe(3);
    expect(totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(545, 10);
    expect(totals.nutrients.NA?.value).toBeCloseTo(2 + 105 + 140, 10);
  });

  it('RN-I03 · ADR-061 · si a un alimento le falta el dato, el total es «sin dato» y lo conocido va aparte', () => {
    const { meals, totals } = composition();
    expect(meals[0]?.nutrients.CHOCDF).toEqual({ value: null, known: 0, missing: 1 });
    expect(totals.nutrients.CHOCDF).toMatchObject({ value: null, missing: 1 });
    expect(totals.nutrients.CHOCDF?.known).toBeCloseTo(50, 10);
  });

  it('RN-E10 · ADR-062 · la adecuación usa lo conocido y dice en cuántos alimentos falta', () => {
    const { adequacy } = composition();
    expect(adequacy.rangePct).toEqual([90, 110]);
    expect(adequacy.kcal).toMatchObject({ daysInRange: 0, days: 1, missing: 0, of: 3 });
    expect(adequacy.kcal.pct).toBeCloseTo(54.5, 10);
    expect(adequacy.protein).toMatchObject({ daysInRange: 1, missing: 0 });
    expect(adequacy.protein.pct).toBeCloseTo(92, 10);
    expect(adequacy.cho).toMatchObject({ daysInRange: 0, missing: 1, of: 3 });
    expect(adequacy.cho.pct).toBeCloseTo(50, 10);
  });

  it('RN-D01 · cada suma y cada adecuación con su método, sin repetir los iguales', () => {
    const codes = composition().methods.map((m) => m.methodCode);
    expect(codes.filter((code) => code === 'RECIPE_NUTRIENTS')).toHaveLength(3);
    expect(codes.filter((code) => code === 'ADEQUACY')).toHaveLength(4);
  });

  it('un tiempo sin alimentos suma 0 sin llamar al motor', () => {
    const { meals, totals } = composition({
      ...COMPOSITION,
      meals: COMPOSITION.meals.map((meal, i) => (i === 0 ? { ...meal, items: [] } : meal)),
    });
    expect(meals[0]?.ingredientCount).toBe(0);
    expect(meals[0]?.nutrients.ENERC_KCAL).toEqual({ value: 0, known: 0, missing: 0 });
    expect(totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(405, 10);
  });

  it('RN-E09 · un borrador que no cuadra no se calcula', () => {
    const result = calculateComposition(
      { ...COMPOSITION, meals: COMPOSITION.meals.map((meal) => ({ ...meal, sharePct: 40 })) },
      TARGETS,
      SOURCES,
      [90, 110],
    );
    expect(!result.ok && result.error.code).toBe('NC-NUT-010');
  });
});

const menu = (draft = MENU) => {
  const result = calculateWeeklyMenu(draft, TARGETS, SOURCES, [90, 110]);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('RN-E16 · menú semanal: 7 días con recetas, opciones A y B', () => {
  it('una receta entra como sus ingredientes, escalados a las porciones', () => {
    const lunch = menu().days[0]?.cells[1];
    // 2 porciones de una receta que rinde 2: 200 g de arroz y 150 g de pollo.
    expect(lunch?.a?.ingredientCount).toBe(2);
    expect(lunch?.a?.nutrients.ENERC_KCAL?.value).toBeCloseTo(405, 10);
    expect(lunch?.b?.nutrients.ENERC_KCAL?.value).toBeCloseTo(220, 10);
  });

  it('el total del día es el de la opción A de cada tiempo', () => {
    const { days } = menu();
    expect(days[0]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(545, 10);
    expect(days[0]?.totals.nutrients.CHOCDF).toMatchObject({ value: null, missing: 1 });
    expect(days[6]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(525, 10);
    expect(days[6]?.totals.nutrients.CHOCDF?.value).toBeCloseTo(75, 10);
  });

  it('una opción vacía no tiene totales', () => {
    const draft: WeeklyMenuDraft = {
      ...MENU,
      days: MENU.days.map((day) => ({ meals: [cell([]), ...day.meals.slice(1)] })),
    };
    expect(menu(draft).days[2]?.cells[0]).toEqual({ a: null, b: null });
  });

  it('el promedio semanal: «sin dato» si falta en algún día, con lo conocido y en cuántos días falta', () => {
    const { weeklyAverage } = menu();
    expect(weeklyAverage.ENERC_KCAL?.value).toBeCloseTo((545 * 6 + 525) / 7, 10);
    expect(weeklyAverage.ENERC_KCAL?.missingDays).toBe(0);
    expect(weeklyAverage.CHOCDF).toMatchObject({ value: null, missingDays: 6 });
    expect(weeklyAverage.CHOCDF?.known).toBeCloseTo((50 * 6 + 75) / 7, 10);
  });

  it('RN-E10 · G-20 · la adecuación es la del promedio de la semana, con los días en rango', () => {
    const { adequacy } = menu();
    expect(adequacy.kcal).toMatchObject({ days: 7, daysInRange: 0, missing: 0, of: 7 });
    expect(adequacy.kcal.pct).toBeCloseTo(((545 * 6 + 525) / 7 / 1000) * 100, 10);
    expect(adequacy.cho).toMatchObject({ missing: 6, of: 7 });
    expect(adequacy.cho.pct).toBeCloseTo((50 * 6 + 75) / 7, 10);
  });

  it('RN-E12 · cada receta del menú con lo de una porción', () => {
    const stew = menu().recipes.get(STEW);
    expect(stew?.nutrients.ENERC_KCAL?.value).toBeCloseTo(202.5, 10);
    expect(stew?.nutrients.FIBTG).toEqual({ value: null, known: 0, missing: 1 });
  });

  it('RN-D01 · las sumas iguales cuentan una vez', () => {
    const runs = menu().methods.filter((m) => m.methodCode === 'RECIPE_NUTRIENTS');
    expect(new Set(runs.map((m) => m.inputsHash)).size).toBe(runs.length);
  });
});
