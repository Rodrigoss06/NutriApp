import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { UNIT_OF_WORK, type SecurityContext, type UnitOfWork } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FoodApi } from '../../src/modules/food/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';

/**
 * P8 (PR 3) · catálogo de alimentos por HTTP contra PostgreSQL como app_user: búsqueda sin tildes y por parecido
 * (criterio de P8), detalle con «sin dato» (RN-I03), medidas y factores de la TAFERA, composición de un plato
 * (RN-E12, RN-E16) y alimentos propios de cada organización (RN-I01).
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let other: StaffOrganization;
let cookie: string;

interface Summary {
  id: string;
  name: string;
  sourceFoodCode: string | null;
  state: string;
  own: boolean;
}
interface Detail extends Summary {
  version: number;
  nutrients: { code: string; valuePer100g: number | null; flag: string | null }[];
  measures: { id: string; name: string; grams: number; grossGrams: number | null }[];
  cookingFactors: { cookingMethod: string; cookedToRawFactor: number }[];
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** El id de un alimento de la TPCA 2017 por su código. */
async function tpca(code: string): Promise<string> {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM food.food WHERE source_code = 'TPCA_2017' AND source_food_code = $1`,
    [code],
  );
  return row?.id ?? '';
}

const search = async (query: string, as = cookie) =>
  ((await harness.get(`/foods?${query}`, as)).body as { foods: Summary[] }).foods;

const detail = async (foodId: string) =>
  (await harness.get(`/foods/${foodId}`, cookie)).body as Detail;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  other = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // Los catálogos reales con una línea en blanco al final: otro hash, así este lote se aplica (con upserts que no
  // cambian nada si ya estaban) y la prueba de catálogos sigue siendo la primera en aplicar cada archivo.
  const importer = harness.app.get(CatalogImporter);
  for (const [kind, file] of [
    ['TPCA_FOODS', 'food/tpca-2017.csv'],
    ['TAFERA_MEASURES', 'food/tafera-2016-medidas.csv'],
    ['TAFERA_COOKING_FACTORS', 'food/tafera-2016-factores.csv'],
  ] as const) {
    const report = await importer.run({
      kind,
      fileName: file,
      content: Buffer.concat([await readFile(new URL(file, SEEDS)), Buffer.from('\n')]),
      organizationId: null,
      startedBy: id() as UserId,
    });
    expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  }
});

afterAll(async () => {
  await harness.app.close();
});

describe('RF-38 · P8 · búsqueda de alimentos', () => {
  it('criterio 2: «platano» encuentra «Plátano» en menos de 100 ms con el catálogo completo', async () => {
    await search('q=platano');
    const started = performance.now();
    const foods = await search('q=platano');
    const elapsed = performance.now() - started;

    expect(foods.length).toBeGreaterThan(5);
    expect(foods[0]?.name).toMatch(/^Plátano/);
    expect(elapsed).toBeLessThan(100);
  });

  it('todas las palabras en cualquier orden, y el estado pedido primero (RN-E12)', async () => {
    const cooked = await search('q=arroz%20cocido&state=COOKED');
    expect(cooked[0]).toMatchObject({ sourceFoodCode: 'A2', state: 'COOKED' });

    const kiwicha = await search('q=kiwicha&limit=10');
    expect(kiwicha.map((f) => f.sourceFoodCode)).toContain('A1');
  });

  it('FoodApi.resolve: el término dice el estado («arroz cocido») y da candidatos con su parecido', async () => {
    const uow = harness.app.get<UnitOfWork>(UNIT_OF_WORK);
    const context: SecurityContext = {
      organizationId: org.organizationId as SecurityContext['organizationId'],
      userId: org.staff.responsible.userId as UserId,
      role: 'PROFESSIONAL',
      patientId: null,
    };
    const candidates = await uow.query(context, () =>
      harness.app.get(FoodApi).resolve('Arroz  cocido'),
    );

    expect(candidates[0]).toMatchObject({ sourceFoodCode: 'A2', state: 'COOKED' });
    expect(candidates[0]?.score).toBeGreaterThan(0);
    expect(candidates[0]?.score).toBeLessThanOrEqual(1);
  });

  it('el término y el límite se validan: 400 con los campos', async () => {
    const response = await harness.get('/foods?limit=500', cookie);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'NC-PLT-400' });
  });
});

describe('RN-I03 · detalle del alimento', () => {
  it('criterio 3: la fibra que la TPCA no trae es «sin dato» (null con MISSING), distinto del cero publicado', async () => {
    const rice = await detail(await tpca('A2'));
    const nutrient = (code: string) => rice.nutrients.find((n) => n.code === code);

    expect(rice.nutrients).toHaveLength(22);
    expect(nutrient('FIBTG')).toMatchObject({ valuePer100g: null, flag: 'MISSING' });
    expect(nutrient('VITC')).toMatchObject({ valuePer100g: 0, flag: null });
    expect(rice).toMatchObject({ own: false, state: 'COOKED' });
  });

  it('las medidas caseras y los factores de cocción de la TAFERA (RN-E12)', async () => {
    const rice = await detail(await tpca('A3'));

    expect(rice.measures[0]).toMatchObject({
      name: 'Taza de acero al ras',
      grams: 203.8,
      grossGrams: null,
    });
    expect(
      rice.cookingFactors.map(({ cookingMethod, cookedToRawFactor }) => [
        cookingMethod,
        cookedToRawFactor,
      ]),
    ).toContainEqual(['Sancochado', 0.51]);
  });
});

describe('RN-E12 · RN-E16 · composición de un plato', () => {
  it('gramos o medidas caseras: totales del motor con su método, y «sin dato» si a un alimento le falta', async () => {
    const cookedRice = await detail(await tpca('A2'));
    const rawRice = await detail(await tpca('A3'));
    const cup = rawRice.measures[0];
    const response = await harness.post(
      '/foods/composition',
      {
        items: [
          { foodId: cookedRice.id, grams: 150 },
          { foodId: rawRice.id, measureId: cup?.id, quantity: 0.5 },
        ],
      },
      cookie,
    );

    expect(response.status).toBe(200);
    const plate = response.body as {
      methodCode: string;
      weightG: number;
      items: { grams: number; measure: string | null }[];
      totals: { code: string; value: number | null }[];
      issues: { code: string }[];
    };
    const kcal = (food: Detail) =>
      food.nutrients.find((n) => n.code === 'ENERC_KCAL')?.valuePer100g ?? 0;
    const total = (code: string) => plate.totals.find((t) => t.code === code)?.value;

    expect(plate.methodCode).toBe('RECIPE_NUTRIENTS');
    expect(plate.items[1]).toMatchObject({ grams: 101.9, measure: 'Taza de acero al ras' });
    expect(plate.weightG).toBeCloseTo(251.9, 6);
    expect(total('ENERC_KCAL')).toBeCloseTo(
      (150 * kcal(cookedRice)) / 100 + (101.9 * kcal(rawRice)) / 100,
      6,
    );
    expect(total('FIBTG')).toBeNull();
    expect(plate.issues.map((i) => i.code)).toContain('NC-ENG-307');
  });

  it('una medida de otro alimento es 422 y un alimento que no existe, 404', async () => {
    const rawRice = await detail(await tpca('A3'));
    const cookedRice = await tpca('A2');

    const wrong = await harness.post(
      '/foods/composition',
      { items: [{ foodId: cookedRice, measureId: rawRice.measures[0]?.id, quantity: 1 }] },
      cookie,
    );
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({ code: 'NC-FOOD-005', rule: 'RN-E12' });

    const missing = await harness.post(
      '/foods/composition',
      { items: [{ foodId: id(), grams: 100 }] },
      cookie,
    );
    expect(missing.status).toBe(404);
  });
});

describe('RN-I01 · alimentos propios de la organización', () => {
  const BREAD = {
    name: 'Pan de la casa (prueba)',
    state: 'READY',
    nutrients: { ENERC_KCAL: 270, PROCNT: 8.5, FAT: 2, CHOCDF: 55 },
    measures: [{ name: 'Unidad', grams: 40 }],
  };

  it('se crea, aparece en la búsqueda de su organización y en ninguna otra; lo no enviado es «sin dato»', async () => {
    const created = await harness.post('/foods', BREAD, cookie);
    expect(created.status).toBe(201);
    const bread = created.body as Detail & { sourceCode: string };

    expect(bread).toMatchObject({ own: true, sourceCode: 'ORG', version: 0, state: 'READY' });
    expect(bread.nutrients.find((n) => n.code === 'FIBTG')).toMatchObject({
      valuePer100g: null,
      flag: 'MISSING',
    });
    expect((await search('q=pan%20de%20la%20casa')).map((f) => f.id)).toContain(bread.id);
    expect(
      (await search('q=pan%20de%20la%20casa', other.staff.responsible.cookie)).map((f) => f.id),
    ).not.toContain(bread.id);
    expect((await harness.get(`/foods/${bread.id}`, other.staff.responsible.cookie)).status).toBe(
      404,
    );
  });

  it('se edita con If-Match y reemplaza sus medidas; una versión vieja es 409 y sin If-Match, 428', async () => {
    const bread = (await harness.post('/foods', BREAD, cookie)).body as Detail;
    const changed = { ...BREAD, measures: [{ name: 'Tajada', grams: 25 }] };

    const updated = await harness.put(`/foods/${bread.id}`, changed, cookie).set('If-Match', '0');
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 1, measures: [{ name: 'Tajada', grams: 25 }] });

    const stale = await harness.put(`/foods/${bread.id}`, changed, cookie).set('If-Match', '0');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-FOOD-004' });
    expect((await harness.put(`/foods/${bread.id}`, changed, cookie)).status).toBe(428);
  });

  it('los alimentos de la TPCA no se editan (403) y lo que no cabe en 100 g es 422 con RN-I03', async () => {
    const global = await harness
      .put(`/foods/${await tpca('A2')}`, BREAD, cookie)
      .set('If-Match', '0');
    expect(global.status).toBe(403);
    expect(global.body).toMatchObject({ code: 'NC-FOOD-003', rule: 'RN-I01' });

    const invalid = await harness.post(
      '/foods',
      { ...BREAD, nutrients: { PROCNT: 60, FAT: 50 } },
      cookie,
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ code: 'NC-FOOD-001', rule: 'RN-I03' });
  });

  it('crear y editar se auditan desde sus eventos (RN-B03)', async () => {
    const bread = (await harness.post('/foods', BREAD, cookie)).body as Detail;
    await harness
      .put(`/foods/${bread.id}`, { ...BREAD, name: 'Pan de la casa, nuevo' }, cookie)
      .set('If-Match', '0');
    await harness.deliver('audit.events');

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'food.food' AND resource_id = $1 ORDER BY occurred_at, id`,
      [bread.id],
    );
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]?.fields).toEqual(['name_es']);
  });
});
