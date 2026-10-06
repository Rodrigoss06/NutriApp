import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { kg } from '../units.js';
import {
  ADEQUACY,
  ATWATER_KCAL_PER_G,
  DEMO_EXCHANGE_LIST,
  EXCHANGES_CLASSIC,
  MACROS_PROTEIN_FIRST,
  MEAL_SPLIT_LARGEST_REMAINDER,
  RECIPE_NUTRIENTS,
} from './index.js';

const codes = (run: ReturnType<typeof runMethod>) =>
  run.ok ? run.result.warnings.map((w) => w.code) : ['no calculó'];

describe('RN-E07 · macronutrientes', () => {
  const macros = (fatPctKcal: number, targetKcal = 2000) =>
    runMethod(MACROS_PROTEIN_FIRST, {
      targetKcal,
      weightKg: kg(70),
      proteinGPerKg: 1.6,
      fatPctKcal,
    });

  it('Atwater: 4, 4 y 9 kcal por gramo; alcohol 7', () => {
    expect(ATWATER_KCAL_PER_G).toEqual({ cho: 4, protein: 4, fat: 9, alcohol: 7 });
  });

  it.each([
    [20, []],
    [35, []],
    [19, ['NC-ENG-301']],
    [36, ['NC-ENG-301']],
  ])('grasa al %s % de las kcal: advertencias %j', (fatPct, expected) => {
    expect(codes(macros(fatPct))).toEqual(expected);
  });

  it('no se puede guardar con carbohidratos negativos', () => {
    expect(expectErrors(macros(35, 600))).toEqual([
      { rule: 'RN-E07', code: 'NC-ENG-302', severity: 'ERROR' },
    ]);
  });
});

describe('RN-E08 · intercambios', () => {
  it('nunca da intercambios negativos: si los grupos fijos ya superan el objetivo, queda en 0 y avisa', () => {
    const run = runMethod(EXCHANGES_CLASSIC, {
      target: { choG: 50, proteinG: 20, fatG: 0 },
      fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
      list: DEMO_EXCHANGE_LIST,
    });
    const { servings } = expectOk(run).outputs;
    expect(servings.STA).toBe(0);
    expect(servings.MEAT).toBe(0);
    expect(codes(run)).toEqual(['NC-ENG-303']);
  });

  it('rechaza una lista sin los seis grupos del algoritmo clásico', () => {
    const list = {
      ...DEMO_EXCHANGE_LIST,
      groups: DEMO_EXCHANGE_LIST.groups.filter((g) => g.code !== 'FAT'),
    };
    expect(
      expectErrors(
        runMethod(EXCHANGES_CLASSIC, {
          target: { choG: 200, proteinG: 100, fatG: 50 },
          fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
          list,
        }),
      ),
    ).toEqual([{ rule: 'RN-E08', code: 'NC-ENG-304', severity: 'ERROR' }]);
  });

  it('la lista de demostración está marcada como provisional (R4)', () => {
    expect(DEMO_EXCHANGE_LIST.provisional).toBe(true);
  });
});

describe('RN-E09 · reparto por tiempos de comida', () => {
  it('rechaza porcentajes que no suman 100', () => {
    expect(
      expectErrors(
        runMethod(MEAL_SPLIT_LARGEST_REMAINDER, {
          totalServings: 6,
          meals: [
            { meal: 'Desayuno', pct: 50 },
            { meal: 'Cena', pct: 40 },
          ],
        }),
      ),
    ).toEqual([{ rule: 'RN-E09', code: 'NC-ENG-305', severity: 'ERROR' }]);
  });

  it('rechaza un total que no es un entero no negativo', () => {
    expect(
      expectErrors(
        runMethod(MEAL_SPLIT_LARGEST_REMAINDER, {
          totalServings: 2.5,
          meals: [{ meal: 'Cena', pct: 100 }],
        }),
      ),
    ).toEqual([{ rule: 'RN-E09', code: 'NC-ENG-306', severity: 'ERROR' }]);
  });

  it('con residuos iguales gana el tiempo que va primero', () => {
    const { servingsByMeal } = expectOk(
      runMethod(MEAL_SPLIT_LARGEST_REMAINDER, {
        totalServings: 1,
        meals: [
          { meal: 'Almuerzo', pct: 50 },
          { meal: 'Cena', pct: 50 },
        ],
      }),
    ).outputs;
    expect(servingsByMeal).toEqual([
      { meal: 'Almuerzo', servings: 1 },
      { meal: 'Cena', servings: 0 },
    ]);
  });
});

describe('RN-E12 y RN-I03 · nutrientes de una receta', () => {
  const ingredients = [
    { foodCode: 'A', grams: 200, per100g: { kcal: 130, proteinG: 2.5, fiberG: null } },
    { foodCode: 'B', grams: 100, per100g: { kcal: 50, proteinG: 1, fiberG: 2 } },
  ];

  it('totales, por porción y por 100 g cocidos con el factor de rendimiento', () => {
    const run = runMethod(RECIPE_NUTRIENTS, { ingredients, servings: 4, cookedWeightG: 450 });
    const { outputs } = expectOk(run);

    expect(outputs.totals).toEqual({ kcal: 310, proteinG: 6, fiberG: null });
    expect(outputs.perServing).toEqual({ kcal: 77.5, proteinG: 1.5, fiberG: null });
    expect(outputs.rawWeightG).toBe(300);
    expect(outputs.yieldFactor).toBeCloseTo(1.5, 12);
    expect(outputs.per100gCooked?.kcal).toBeCloseTo((310 / 450) * 100, 12);
    expect(codes(run)).toEqual(['NC-ENG-307']);
  });

  it('un dato faltante no se cuenta como cero: el total queda «sin dato»', () => {
    const { outputs } = expectOk(runMethod(RECIPE_NUTRIENTS, { ingredients, servings: 1 }));
    expect(outputs.totals.fiberG).toBeNull();
    expect(outputs.yieldFactor).toBeNull();
    expect(outputs.per100gCooked).toBeNull();
  });

  it('rechaza porciones que no son positivas', () => {
    expect(expectErrors(runMethod(RECIPE_NUTRIENTS, { ingredients, servings: 0 }))).toEqual([
      { rule: 'RN-E12', code: 'NC-ENG-308', severity: 'ERROR' },
    ]);
  });
});

describe('RN-E10 · adecuación', () => {
  it('usa el rango configurado por la organización', () => {
    const { outputs } = expectOk(
      runMethod(ADEQUACY, {
        prescribed: 100,
        consumedDaily: [84, 86, 115, 116],
        acceptableRangePct: [85, 115],
      }),
    );
    expect(outputs.daysInRange).toBe(2);
  });

  it('rechaza un prescrito que no es positivo o una semana vacía', () => {
    expect(expectErrors(runMethod(ADEQUACY, { prescribed: 0, consumedDaily: [10] }))).toEqual([
      { rule: 'RN-E10', code: 'NC-ENG-309', severity: 'ERROR' },
    ]);
    expect(expectErrors(runMethod(ADEQUACY, { prescribed: 10, consumedDaily: [] }))).toEqual([
      { rule: 'RN-E10', code: 'NC-ENG-309', severity: 'ERROR' },
    ]);
  });
});
