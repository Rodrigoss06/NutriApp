import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { kg } from '../units.js';
import {
  ADEQUACY,
  ATWATER_KCAL_PER_G,
  DEMO_EXCHANGE_LIST,
  EXCHANGES_CLASSIC,
  MACROS_DAY_PROFILE,
  MACROS_PROTEIN_FIRST,
  MEAL_SPLIT_LARGEST_REMAINDER,
  RECIPE_NUTRIENTS,
  STARCH_BY_DAY_PROFILE,
} from './index.js';

const codes = (run: ReturnType<typeof runMethod>) =>
  run.ok ? run.result.warnings.map((w) => w.code) : ['no calculó'];

describe('RN-E07 · los perfiles de día: mandan los gramos (07 §2, P-20)', () => {
  // P-20.2, respuesta de Jeremy (2026-11-08): mandan los gramos y las kcal salen de ellos. La hoja piloto da a Mateo
  // 160 g de proteína y 70 g de grasa los dos días, y 310 g de carbohidratos el día de entrenamiento y 240 g el de descanso.
  const profile = (choG: number, proteinG = 160, fatG = 70) =>
    runMethod(MACROS_DAY_PROFILE, { choG, proteinG, fatG });

  it('G-41 · las kcal salen de los gramos con Atwater: 2,230 el día de descanso y 2,510 el de entrenamiento', () => {
    expect(expectOk(profile(240)).outputs).toEqual({
      kcal: 2230,
      choG: 240,
      proteinG: 160,
      fatG: 70,
    });
    expect(expectOk(profile(310)).outputs.kcal).toBe(2510);
  });

  it('lleva su método y su versión, con el hash de los insumos (RN-D01)', () => {
    const result = expectOk(profile(240));
    expect(result.methodCode).toBe('MACROS_DAY_PROFILE');
    expect(result.methodVersion).toBe('1.0.0');
    expect(result.inputs).toEqual({ choG: 240, proteinG: 160, fatG: 70 });
    expect(result.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [-1, 160, 70],
    [240, -1, 70],
    [240, 160, -1],
    [Number.NaN, 160, 70],
    [0, 0, 0],
  ])(
    '%s g de carbohidratos, %s de proteína y %s de grasa: insumos fuera de rango',
    (choG, proteinG, fatG) => {
      expect(expectErrors(profile(choG, proteinG, fatG))).toEqual([
        { rule: 'RN-E07', code: 'NC-ENG-312', severity: 'ERROR' },
      ]);
    },
  );
});

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

describe('RN-E09 · los almidones de un perfil de día por tiempo (07 §2, P-20.5 y P-20.6)', () => {
  // P-20.5, respuesta de Jeremy (2026-11-08): el día de descanso es el mismo plan con menos almidones, y solo cambia la cantidad
  // del alimento fuente. El coach decidió quitarlos primero de la media tarde y luego de la cena (ADR-102). P-20.6 (2026-11-09):
  // en un día alto se suman en las mismas comidas, alternando la media tarde y la cena. Tiempos de G-19.
  const meals = (starch: readonly number[]) =>
    (
      [
        ['Desayuno', 'BREAKFAST'],
        ['Media mañana', 'MID_MORNING'],
        ['Almuerzo', 'LUNCH'],
        ['Media tarde', 'AFTERNOON'],
        ['Cena', 'DINNER'],
      ] as const
    ).map(([meal, slotCode], index) => ({ meal, slotCode, starch: starch[index] ?? 0 }));
  const run = (profileChoG: number, starch: readonly number[], baseChoG = 310) =>
    runMethod(STARCH_BY_DAY_PROFILE, {
      baseChoG,
      profileChoG,
      starchChoG: DEMO_EXCHANGE_LIST.groups.find((g) => g.code === 'STA')?.choG ?? 0,
      meals: meals(starch),
    });
  const servings = (result: ReturnType<typeof run>) =>
    expectOk(result).outputs.servingsByMeal.map((row) => row.servings);

  it('de 310 a 240 g faltan 70 g, unos 5 intercambios: primero la media tarde, luego la cena y después el almuerzo', () => {
    const result = expectOk(run(240, [3, 1, 3, 2, 2]));
    expect(result.outputs.deltaServings).toBe(-5);
    expect(result.outputs.servingsByMeal).toEqual([
      { meal: 'Desayuno', servings: 3 },
      { meal: 'Media mañana', servings: 1 },
      { meal: 'Almuerzo', servings: 2 },
      { meal: 'Media tarde', servings: 0 },
      { meal: 'Cena', servings: 0 },
    ]);
    expect(result.methodCode).toBe('STARCH_BY_DAY_PROFILE');
    expect(result.methodVersion).toBe('1.0.0');
  });

  it('pasada la media tarde y la cena, quita del último tiempo del día hacia el primero', () => {
    expect(servings(run(220, [3, 1, 3, 1, 1]))).toEqual([3, 0, 0, 0, 0]);
  });

  it('si los almidones del plan no alcanzan, quedan en 0 y el perfil pide más de los que hay', () => {
    const result = expectOk(run(200, [0, 0, 1, 1, 1]));
    expect(result.outputs.deltaServings).toBe(-7);
    expect(servings(run(200, [0, 0, 1, 1, 1]))).toEqual([0, 0, 0, 0, 0]);
  });

  it('el día alto de Mateo, de 310 a 370 g, suma 4 almidones alternando la media tarde y la cena (P-20.6)', () => {
    const result = expectOk(run(370, [3, 1, 3, 2, 2]));
    expect(result.outputs.deltaServings).toBe(4);
    expect(servings(run(370, [3, 1, 3, 2, 2]))).toEqual([3, 1, 3, 4, 4]);
  });

  it('con un número impar de almidones, la media tarde lleva uno más que la cena (P-20.6)', () => {
    expect(servings(run(325, [3, 1, 3, 2, 2]))).toEqual([3, 1, 3, 3, 2]);
    expect(servings(run(385, [3, 1, 3, 0, 0]))).toEqual([3, 1, 3, 3, 2]);
  });

  it('un plan sin media tarde ni cena suma por turnos del último tiempo al primero', () => {
    const result = expectOk(
      runMethod(STARCH_BY_DAY_PROFILE, {
        baseChoG: 300,
        profileChoG: 360,
        starchChoG: 15,
        meals: [
          { meal: 'Desayuno', slotCode: 'BREAKFAST', starch: 2 },
          { meal: 'Almuerzo', slotCode: 'LUNCH', starch: 3 },
          { meal: 'Refrigerio', slotCode: 'CUSTOM', starch: 1 },
        ],
      }),
    );
    expect(result.outputs.servingsByMeal.map((row) => row.servings)).toEqual([3, 4, 3]);
  });

  it('con los mismos carbohidratos no cambia nada; medio intercambio cuenta como uno, de más o de menos', () => {
    expect(expectOk(run(310, [3, 1, 3, 2, 2])).outputs.deltaServings).toBe(0);
    expect(servings(run(310, [3, 1, 3, 2, 2]))).toEqual([3, 1, 3, 2, 2]);
    expect(expectOk(run(302.5, [3, 1, 3, 2, 2])).outputs.deltaServings).toBe(-1);
    expect(expectOk(run(317.5, [3, 1, 3, 2, 2])).outputs.deltaServings).toBe(1);
    expect(expectOk(run(305, [3, 1, 3, 2, 2])).outputs.deltaServings).toBe(0);
  });

  it('con dos medias tardes, quita primero de la más tarde y suma por turnos en las dos y en la cena', () => {
    const twoAfternoons = (profileChoG: number) =>
      expectOk(
        runMethod(STARCH_BY_DAY_PROFILE, {
          baseChoG: 300,
          profileChoG,
          starchChoG: 15,
          meals: [
            { meal: 'Desayuno', slotCode: 'BREAKFAST', starch: 2 },
            { meal: 'Media tarde', slotCode: 'AFTERNOON', starch: 1 },
            { meal: 'Postentreno', slotCode: 'AFTERNOON', starch: 1 },
            { meal: 'Cena', slotCode: 'DINNER', starch: 1 },
          ],
        }),
      ).outputs.servingsByMeal.map((row) => row.servings);
    expect(twoAfternoons(285)).toEqual([2, 1, 0, 1]);
    expect(twoAfternoons(360)).toEqual([2, 2, 3, 2]);
  });

  it('rechaza un intercambio sin carbohidratos, gramos negativos, almidones que no son enteros y un plan sin tiempos', () => {
    const base = { baseChoG: 310, profileChoG: 240, starchChoG: 15, meals: meals([3, 1, 3, 2, 2]) };
    const error = (code: string) => [{ rule: 'RN-E09', code, severity: 'ERROR' }];
    expect(expectErrors(runMethod(STARCH_BY_DAY_PROFILE, { ...base, starchChoG: 0 }))).toEqual(
      error('NC-ENG-313'),
    );
    expect(expectErrors(runMethod(STARCH_BY_DAY_PROFILE, { ...base, profileChoG: -1 }))).toEqual(
      error('NC-ENG-313'),
    );
    expect(
      expectErrors(runMethod(STARCH_BY_DAY_PROFILE, { ...base, meals: meals([3, 1, 2.5, 2, 2]) })),
    ).toEqual(error('NC-ENG-314'));
    expect(expectErrors(runMethod(STARCH_BY_DAY_PROFILE, { ...base, meals: [] }))).toEqual(
      error('NC-ENG-314'),
    );
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

  it('RN-I03 · 1.1.0: lo conocido se suma aparte, con cuántos ingredientes no traen el dato; el total no cambia', () => {
    const run = runMethod(RECIPE_NUTRIENTS, { ingredients, servings: 4 });
    const { outputs, methodVersion } = expectOk(run);

    expect(methodVersion).toBe('1.1.0');
    expect(outputs.totals).toEqual({ kcal: 310, proteinG: 6, fiberG: null });
    expect(outputs.knownTotals).toEqual({ kcal: 310, proteinG: 6, fiberG: 2 });
    expect(outputs.knownPerServing).toEqual({ kcal: 77.5, proteinG: 1.5, fiberG: 0.5 });
    expect(outputs.missingIngredients).toEqual({ kcal: 0, proteinG: 0, fiberG: 1 });
  });

  it('RN-I03 · un nutriente que un ingrediente no menciona también falta en él', () => {
    const { outputs } = expectOk(
      runMethod(RECIPE_NUTRIENTS, {
        ingredients: [
          { grams: 100, per100g: { kcal: 100, naMg: 10 } },
          { grams: 100, per100g: { kcal: 50 } },
        ],
        servings: 1,
      }),
    );
    expect(outputs.totals.naMg).toBeNull();
    expect(outputs.knownTotals.naMg).toBe(10);
    expect(outputs.missingIngredients).toEqual({ kcal: 0, naMg: 1 });
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
