import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';

/**
 * P10 (PR 1) · recetario por HTTP contra PostgreSQL como app_user, con la TPCA 2017 cargada: nutrientes por porción
 * del motor (criterio 1 de P10, RN-E12), «al menos X» con cuántos ingredientes no traen el dato (RN-I03, ADR-061),
 * caché que se recalcula al cambiar la receta o un alimento propio, archivar y la auditoría (RN-B03).
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let other: StaffOrganization;
let cookie: string;
let rice: string;
let chicken: string;

interface Nutrient {
  code: string;
  perServing: number | null;
  knownPerServing: number;
  missingIngredients: number;
  per100gCooked: number | null;
}
interface Detail {
  id: string;
  name: string;
  servings: number;
  status: string;
  version: number;
  ingredients: {
    foodId: string;
    name: string;
    state: string;
    grams: number;
    householdText: string | null;
  }[];
  calculation: {
    methodCode: string;
    methodVersion: string;
    engineVersion: string;
    inputsHash: string;
    ingredientCount: number;
    rawWeightG: number;
    yieldFactor: number | null;
    nutrients: Nutrient[];
    issues: { code: string }[];
  };
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

async function tpca(code: string): Promise<string> {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM food.food WHERE source_code = 'TPCA_2017' AND source_food_code = $1`,
    [code],
  );
  return row?.id ?? '';
}

const nutrient = (recipe: Detail, code: string) =>
  recipe.calculation.nutrients.find((n) => n.code === code);

/** 200 g de arroz pilado cocido (A2) y 150 g de pollo, carne pulpa (F26), para dos porciones. */
const riceAndChicken = () => ({
  name: 'Arroz con pollo (prueba)',
  servings: 2,
  tags: ['almuerzo'],
  ingredients: [
    { foodId: rice, grams: 200, householdText: '1 taza' },
    { foodId: chicken, grams: 150 },
  ],
});

const search = async (query: string, as = cookie) =>
  ((await harness.get(`/recipes?${query}`, as)).body as { recipes: { id: string }[] }).recipes.map(
    (r) => r.id,
  );

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  other = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // La TPCA con una línea en blanco al final, como foods.int.spec.ts: la prueba de catálogos sigue siendo la primera
  // en aplicar el archivo tal cual.
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'TPCA_FOODS',
    fileName: 'food/tpca-2017.csv',
    content: Buffer.concat([
      await readFile(new URL('food/tpca-2017.csv', SEEDS)),
      Buffer.from('\n'),
    ]),
    organizationId: null,
    startedBy: id() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  rice = await tpca('A2');
  chicken = await tpca('F26');
});

afterAll(async () => {
  await harness.app.close();
});

describe('RF-21 · RN-E12 · P10 · nutrientes por porción de una receta', () => {
  it('criterio 1: arroz cocido y pollo dan los nutrientes por porción esperados según la TPCA cargada', async () => {
    const created = await harness.post('/recipes', riceAndChicken(), cookie);
    expect(created.status).toBe(201);
    const recipe = created.body as Detail;

    expect(recipe).toMatchObject({ servings: 2, status: 'ACTIVE', version: 0 });
    expect(recipe.calculation).toMatchObject({
      methodCode: 'RECIPE_NUTRIENTS',
      methodVersion: '1.1.0',
      ingredientCount: 2,
      rawWeightG: 350,
      yieldFactor: null,
    });
    expect(recipe.calculation.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    // (200 × 115 + 150 × 119) ÷ 100 ÷ 2, y así cada uno.
    expect(nutrient(recipe, 'ENERC_KCAL')?.perServing).toBeCloseTo(204.25, 10);
    expect(nutrient(recipe, 'PROCNT')?.perServing).toBeCloseTo(18.45, 10);
    expect(nutrient(recipe, 'FAT')?.perServing).toBeCloseTo(2.425, 10);
    expect(nutrient(recipe, 'CHOCDF')?.perServing).toBeCloseTo(25.2, 10);
    expect(recipe.calculation.nutrients).toHaveLength(22);
    expect(recipe.calculation.issues.map((i) => i.code)).toEqual(['NC-ENG-307']);
    expect(recipe.ingredients).toMatchObject([
      { foodId: rice, state: 'COOKED', grams: 200, householdText: '1 taza' },
      { foodId: chicken, grams: 150, householdText: null },
    ]);
  });

  it('RN-I03 · ADR-061: si a un ingrediente le falta el dato, es «sin dato»; lo conocido va aparte con cuántos faltan', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;

    // La TPCA no trae la fibra del arroz cocido, ni el sodio del pollo.
    expect(nutrient(recipe, 'FIBTG')).toMatchObject({
      perServing: null,
      knownPerServing: 0,
      missingIngredients: 1,
    });
    expect(nutrient(recipe, 'NA')).toMatchObject({ perServing: null, missingIngredients: 1 });
    expect(nutrient(recipe, 'NA')?.knownPerServing).toBeCloseTo(18, 10);
    expect(nutrient(recipe, 'ENERC_KCAL')?.missingIngredients).toBe(0);
  });

  it('la caché queda en la base con el método, la versión del motor y el hash (RN-D01)', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;
    const [row] = await owner<{
      cache: { methodCode: string; engineVersion: string; inputsHash: string };
    }>(`SELECT nutrients_per_serving AS cache FROM food.recipe WHERE id = $1`, [recipe.id]);

    expect(row?.cache).toMatchObject({
      methodCode: 'RECIPE_NUTRIENTS',
      engineVersion: recipe.calculation.engineVersion,
      inputsHash: recipe.calculation.inputsHash,
    });
  });

  it('con el peso cocido, el factor de rendimiento y los nutrientes por 100 g cocidos', async () => {
    const recipe = (
      await harness.post('/recipes', { ...riceAndChicken(), cookedWeightG: 500 }, cookie)
    ).body as Detail;

    expect(recipe.calculation.yieldFactor).toBeCloseTo(500 / 350, 10);
    expect(nutrient(recipe, 'ENERC_KCAL')?.per100gCooked).toBeCloseTo((408.5 / 500) * 100, 10);
  });

  it('la vista previa calcula sin guardar nada', async () => {
    const [before] = await owner<{ count: number }>(
      `SELECT count(*)::int AS count FROM food.recipe WHERE organization_id = $1`,
      [org.organizationId],
    );
    const response = await harness.post('/recipes/preview', riceAndChicken(), cookie);
    const [after] = await owner<{ count: number }>(
      `SELECT count(*)::int AS count FROM food.recipe WHERE organization_id = $1`,
      [org.organizationId],
    );

    expect(response.status).toBe(200);
    const preview = response.body as Pick<Detail, 'ingredients' | 'calculation'>;
    expect(
      preview.calculation.nutrients.find((n) => n.code === 'ENERC_KCAL')?.perServing,
    ).toBeCloseTo(204.25, 10);
    expect(after?.count).toBe(before?.count);
  });

  it('cero porciones es 400 y un alimento que la organización no ve, 422 (RN-A01)', async () => {
    const zero = await harness.post('/recipes', { ...riceAndChicken(), servings: 0 }, cookie);
    expect(zero.status).toBe(400);

    const foreign = (
      await harness.post(
        '/foods',
        { name: 'Aderezo de otra (prueba)', state: 'READY', nutrients: { ENERC_KCAL: 100 } },
        other.staff.responsible.cookie,
      )
    ).body as { id: string };
    const response = await harness.post(
      '/recipes',
      { ...riceAndChicken(), ingredients: [{ foodId: foreign.id, grams: 10 }] },
      cookie,
    );
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-FOOD-002' });
  });
});

describe('RF-21 · recetario de la organización', () => {
  it('aparece en la búsqueda de su organización, sin tildes, y en ninguna otra (RN-A01)', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;

    expect(await search('q=ARROZ%20con%20pollo')).toContain(recipe.id);
    expect(await search('q=arroz', other.staff.responsible.cookie)).not.toContain(recipe.id);
    expect(
      (await harness.get(`/recipes/${recipe.id}`, other.staff.responsible.cookie)).status,
    ).toBe(404);
    const [summary] = (
      (await harness.get('/recipes?q=arroz%20con%20pollo&limit=1', cookie)).body as {
        recipes: { energyKcalPerServing: number | null; ingredientCount: number }[];
      }
    ).recipes;
    expect(summary?.ingredientCount).toBe(2);
    expect(summary?.energyKcalPerServing).toBeCloseTo(204.25, 10);
  });

  it('se edita con If-Match y recalcula; una versión vieja es 409 y sin If-Match, 428', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;

    const updated = await harness
      .put(`/recipes/${recipe.id}`, { ...riceAndChicken(), servings: 4 }, cookie)
      .set('If-Match', '0');
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ servings: 4, version: 1 });
    expect(nutrient(updated.body as Detail, 'ENERC_KCAL')?.perServing).toBeCloseTo(102.125, 10);

    const stale = await harness
      .put(`/recipes/${recipe.id}`, riceAndChicken(), cookie)
      .set('If-Match', '0');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-FOOD-008' });
    expect((await harness.put(`/recipes/${recipe.id}`, riceAndChicken(), cookie)).status).toBe(428);
  });

  it('editar un alimento propio recalcula la caché de las recetas que lo usan, sin cambiar su versión', async () => {
    const dressing = {
      name: 'Aderezo de la casa (prueba)',
      state: 'READY',
      nutrients: { ENERC_KCAL: 100 },
    };
    const food = (await harness.post('/foods', dressing, cookie)).body as { id: string };
    const recipe = (
      await harness.post(
        '/recipes',
        { name: 'Ensalada (prueba)', servings: 1, ingredients: [{ foodId: food.id, grams: 50 }] },
        cookie,
      )
    ).body as Detail;
    expect(nutrient(recipe, 'ENERC_KCAL')?.perServing).toBe(50);

    await harness
      .put(`/foods/${food.id}`, { ...dressing, nutrients: { ENERC_KCAL: 300 } }, cookie)
      .set('If-Match', '0');
    const after = (await harness.get(`/recipes/${recipe.id}`, cookie)).body as Detail;

    expect(nutrient(after, 'ENERC_KCAL')?.perServing).toBe(150);
    expect(after.version).toBe(0);
  });

  it('se archiva en vez de borrarse y se restaura; archivada sale de la búsqueda de activas', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;

    const archived = await harness
      .post(`/recipes/${recipe.id}/archive`, {}, cookie)
      .set('If-Match', '0');
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', version: 1 });
    expect(await search('q=arroz%20con%20pollo&limit=50')).not.toContain(recipe.id);
    expect(await search('q=arroz%20con%20pollo&status=ARCHIVED&limit=50')).toContain(recipe.id);

    const restored = await harness
      .post(`/recipes/${recipe.id}/restore`, {}, cookie)
      .set('If-Match', '1');
    expect(restored.body).toMatchObject({ status: 'ACTIVE', version: 2 });
    const stale = await harness
      .post(`/recipes/${recipe.id}/archive`, {}, cookie)
      .set('If-Match', '0');
    expect(stale.status).toBe(409);
  });

  it('crear, editar y archivar se auditan desde sus eventos, con los nombres de los campos (RN-B03)', async () => {
    const recipe = (await harness.post('/recipes', riceAndChicken(), cookie)).body as Detail;
    await harness
      .put(`/recipes/${recipe.id}`, { ...riceAndChicken(), servings: 3 }, cookie)
      .set('If-Match', '0');
    await harness.post(`/recipes/${recipe.id}/archive`, {}, cookie).set('If-Match', '1');
    await harness.deliver('audit.events');

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'food.recipe' AND resource_id = $1 ORDER BY occurred_at, id`,
      [recipe.id],
    );
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
    expect(rows[1]?.fields).toEqual(['servings']);
    expect(rows[2]?.fields).toEqual(['status']);
  });
});
