import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Test, type TestingModule } from '@nestjs/testing';
import { err, ok, type UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { platformAdmin } from '../../src/cli/catalog-cli.js';
import { CliModule } from '../../src/cli/cli.module.js';
import {
  CatalogImporter,
  ImportRegistry,
  type Db,
  type ImportReport,
} from '../../src/platform/index.js';
import { errorCode, id, PG, pool, withContext } from './support/database.js';

/**
 * Datos maestros (RF-38): el importador genérico con los catálogos reales de seeds/, como app_user y con el rol SYSTEM
 * de la CLI (RN-I01, RN-I03, RN-I04). Los tipos TEST_* prueban el importador sin tocar los catálogos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const startedBy = id() as UserId;

let moduleRef: TestingModule;
let importer: CatalogImporter;
const saved: string[][] = [];

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({ imports: [CliModule] }).compile();
  await moduleRef.init();
  importer = moduleRef.get(CatalogImporter);
  const registry = moduleRef.get(ImportRegistry);
  const db = moduleRef.get<Db>(TransactionHost);
  registry.register<string>({
    kind: 'TEST_ITEMS',
    columns: ['codigo', 'nombre'],
    parse: (record) => (record.nombre ? ok(record.codigo ?? '') : err(['nombre: vacío'])),
    key: (code) => code,
    save: (codes) => {
      saved.push([...codes]);
      return Promise.resolve();
    },
  });
  registry.register<string>({
    kind: 'TEST_FAILS',
    columns: ['codigo'],
    parse: (record) => ok(record.codigo ?? ''),
    key: (code) => code,
    save: async ([code = '']) => {
      await db.tx.$executeRaw`
        INSERT INTO food.food (id, organization_id, source_code, source_food_code, name_es)
        VALUES (${code}::uuid, NULL, 'ORG', ${code}, 'Lote que falla')`;
      throw new Error('Falla a propósito después de escribir.');
    },
  });
});

afterAll(async () => {
  await moduleRef.close();
});

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const run = (kind: string, content: string | Uint8Array, fileName = 'prueba.csv') =>
  importer.run({
    kind,
    fileName,
    content: typeof content === 'string' ? new TextEncoder().encode(content) : content,
    organizationId: null,
    startedBy,
  });

const batch = async (report: ImportReport) =>
  (
    await owner<Record<string, unknown>>(
      `SELECT status, rows_total, rows_ok, rows_failed, errors, file_name, encode(file_sha256, 'hex') AS sha,
              started_by, finished_at IS NOT NULL AS finished
       FROM platform.import_batch WHERE id = $1`,
      [report.batchId],
    )
  )[0];

describe('RF-38 · RN-I04 · importador de catálogos', () => {
  let tpca: Buffer;
  let first: ImportReport;

  // La primera carga de la TPCA, para que cada prueba valga sola, en cualquier orden.
  beforeAll(async () => {
    tpca = await readFile(new URL('food/tpca-2017.csv', SEEDS));
    first = await run('TPCA_FOODS', tpca, 'tpca-2017.csv');
  });

  it('la CLI registra los catálogos de P8', () => {
    expect(importer.kinds()).toEqual(
      expect.arrayContaining([
        'COMPENDIUM_ACTIVITIES',
        'TAFERA_COOKING_FACTORS',
        'TAFERA_MEASURES',
        'TPCA_FOODS',
      ]),
    );
  });

  it('criterio 1: importar dos veces el mismo archivo no duplica nada y el segundo lote queda como repetido', async () => {
    const sha = createHash('sha256').update(tpca).digest('hex');
    const counts = () =>
      owner(
        `SELECT (SELECT count(*)::int FROM food.food WHERE source_code = 'TPCA_2017') AS foods,
                (SELECT count(*)::int FROM food.food_nutrient n JOIN food.food f ON f.id = n.food_id
                 WHERE f.source_code = 'TPCA_2017') AS nutrients`,
      );

    expect(first).toMatchObject({
      status: 'COMPLETED',
      rowsTotal: 928,
      rowsOk: 928,
      rowsFailed: 0,
    });
    expect(await counts()).toEqual([{ foods: 928, nutrients: 928 * 22 }]);
    expect(await batch(first)).toMatchObject({
      status: 'COMPLETED',
      rows_ok: 928,
      file_name: 'tpca-2017.csv',
      sha,
      started_by: startedBy,
      finished: true,
    });

    const second = await run('TPCA_FOODS', tpca, 'tpca-2017.csv');
    expect(second).toMatchObject({
      status: 'DUPLICATE',
      appliedBy: first.batchId,
      rowsTotal: null,
    });
    expect(await batch(second)).toMatchObject({ status: 'DUPLICATE', rows_ok: null, sha });
    expect(await counts()).toEqual([{ foods: 928, nutrients: 928 * 22 }]);
    const [source] = await owner<{ imported: boolean }>(
      `SELECT imported_at IS NOT NULL AS imported FROM food.source WHERE code = 'TPCA_2017'`,
    );
    expect(source?.imported).toBe(true);
  });

  it('RN-I03: «sin dato» queda NULL con MISSING, distinto del cero publicado; trazas e imputados con su marca', async () => {
    const values = await owner(
      `SELECT f.source_food_code AS code, n.nutrient_code AS nutrient, n.value_per_100g::float AS value,
              n.value_flag AS flag
       FROM food.food f JOIN food.food_nutrient n ON n.food_id = f.id
       WHERE f.source_code = 'TPCA_2017'
         AND (f.source_food_code, n.nutrient_code) IN (('A2', 'FIBTG'), ('A2', 'VITC'), ('F98', 'THIA'),
                                                     ('B92', 'PROCNT'))
       ORDER BY 1, 2`,
    );
    expect(values).toEqual([
      { code: 'A2', nutrient: 'FIBTG', value: null, flag: 'MISSING' },
      { code: 'A2', nutrient: 'VITC', value: 0, flag: null },
      { code: 'B92', nutrient: 'PROCNT', value: 9.5, flag: 'IMPUTED' },
      { code: 'F98', nutrient: 'THIA', value: 0, flag: 'TRACE' },
    ]);
    const foods = await owner(
      `SELECT source_food_code AS code, name_es AS name, group_code AS "group", state, tags
       FROM food.food WHERE source_code = 'TPCA_2017' AND source_food_code IN ('A2', 'B92') ORDER BY 1`,
    );
    expect(foods).toEqual([
      {
        code: 'A2',
        name: 'Arroz pilado o pulido cocido',
        group: 'TPCA_A',
        state: 'COOKED',
        tags: [],
      },
      {
        code: 'B92',
        name: 'Ají colorado seco',
        group: 'TPCA_B',
        state: 'RAW',
        tags: ['Imputado de Tabla Boliviana 2005'],
      },
    ]);
  });

  it('TAFERA 2016: medidas y factores de cocción enlazados con la TPCA 2017; repetir el archivo no duplica', async () => {
    const measures = await readFile(new URL('food/tafera-2016-medidas.csv', SEEDS));
    const factors = await readFile(new URL('food/tafera-2016-factores.csv', SEEDS));
    const counts = () =>
      owner(
        `SELECT (SELECT count(*)::int FROM food.household_measure WHERE source_code = 'TAFERA_2016') AS measures,
                (SELECT count(*)::int FROM food.cooking_factor WHERE source_code = 'TAFERA_2016') AS factors`,
      );

    const measured = await run('TAFERA_MEASURES', measures, 'tafera-2016-medidas.csv');
    const factored = await run('TAFERA_COOKING_FACTORS', factors, 'tafera-2016-factores.csv');
    expect(measured).toMatchObject({ status: 'COMPLETED', rowsTotal: 933, rowsOk: 933 });
    expect(factored).toMatchObject({ status: 'COMPLETED', rowsTotal: 213, rowsOk: 213 });
    expect(await counts()).toEqual([{ measures: 933, factors: 213 }]);

    // RN-E12: grams es la parte comestible; el bruto, la manzana entera.
    const apple = await owner(
      `SELECT f.source_food_code AS food, f.name_es AS name, m.name_es AS measure, m.grams::float AS grams,
              m.gross_grams::float AS gross
       FROM food.household_measure m JOIN food.food f ON f.id = m.food_id
       WHERE m.source_code = 'TAFERA_2016' AND m.source_measure_code IN ('3-71', '1-1') ORDER BY 1`,
    );
    expect(apple).toEqual([
      {
        food: 'A3',
        name: 'Arroz blanco corriente',
        measure: 'Taza de acero al ras',
        grams: 203.8,
        gross: null,
      },
      {
        food: 'C116',
        name: 'Manzana delicia roja con cáscara',
        measure: 'Unidad pequeña',
        grams: 100.6,
        gross: 105.7,
      },
    ]);
    const wing = await owner(
      `SELECT f.source_food_code AS food, c.name_es AS name, c.cooking_method_es AS method,
              c.cooked_to_raw_factor::float AS factor
       FROM food.cooking_factor c JOIN food.food f ON f.id = c.food_id
       WHERE c.source_code = 'TAFERA_2016' AND c.source_item_code = 'II-131'`,
    );
    expect(wing).toEqual([{ food: 'F78', name: 'Pollo, ala', method: 'Sancochado', factor: 1.18 }]);

    expect((await run('TAFERA_MEASURES', measures, 'tafera-2016-medidas.csv')).status).toBe(
      'DUPLICATE',
    );
    expect(await counts()).toEqual([{ measures: 933, factors: 213 }]);
    const [source] = await owner<{ imported: boolean }>(
      `SELECT imported_at IS NOT NULL AS imported FROM food.source WHERE code = 'TAFERA_2016'`,
    );
    expect(source?.imported).toBe(true);
  });

  it('una medida de un alimento que no está en la TPCA hace fallar el lote entero y dice cuál falta', async () => {
    const report = await run(
      'TAFERA_MEASURES',
      'codigo,codigo_tpca,alimento,unidad,medida,peso_bruto_g,peso_neto_g,parte_comestible_pct,energia_kcal,datos_1985\n' +
        '12-999,Z999,Prueba,Unidad,Unidad,,10,,10,no\n',
    );

    expect(report).toMatchObject({ status: 'FAILED', rowsTotal: 1, rowsOk: 0 });
    expect(report.failure).toBe(
      'Faltan alimentos de TPCA_2017: Z999. Cárguelos antes (pnpm catalog:load).',
    );
    expect(
      await owner(`SELECT 1 FROM food.household_measure WHERE source_measure_code = '12-999'`),
    ).toEqual([]);
  });

  it('las 560 actividades del Compendium 2024 con su MET; las 9 de P7 conservan el suyo', async () => {
    const compendium = await readFile(new URL('exercise/compendium-2024.csv', SEEDS));
    const report = await run('COMPENDIUM_ACTIVITIES', compendium, 'compendium-2024.csv');

    expect(report).toMatchObject({ status: 'COMPLETED', rowsTotal: 560, rowsOk: 560 });
    const activities = await owner<{
      code: string;
      met: number;
      description_en: string;
      source_version: string;
    }>(
      `SELECT code, met::float AS met, description_en, source_version FROM exercise.physical_activity
       WHERE code IN ('01200', '02048', '02050', '02054', '12050', '15610', '17190', '17200', '18240')
       ORDER BY code`,
    );
    expect(activities.map((a) => [a.code, a.met])).toEqual([
      ['01200', 6.8],
      ['02048', 5],
      ['02050', 6],
      ['02054', 3.5],
      ['12050', 9.3],
      ['15610', 7],
      ['17190', 3.8],
      ['17200', 4.8],
      ['18240', 5.8],
    ]);
    expect(activities[4]).toMatchObject({
      description_en: 'Running, 6-6.3 mph (10 min/mile)',
      source_version: 'COMPENDIUM_2024',
    });
  });

  it('una fila mala no detiene a las demás: el lote queda con errores y la fila de cada uno', async () => {
    const report = await run(
      'TEST_ITEMS',
      `codigo,nombre\nA,Uno\nB,\nA,Repetido\nC,Tres,extra\nD,Cuatro\n`,
    );

    expect(report).toMatchObject({
      status: 'COMPLETED_WITH_ERRORS',
      rowsTotal: 5,
      rowsOk: 2,
      rowsFailed: 3,
    });
    expect(saved.at(-1)).toEqual(['A', 'D']);
    expect((await batch(report))?.errors).toEqual([
      { row: 3, messages: ['nombre: vacío'] },
      { row: 4, messages: ['Código A repetido: ya está en la fila 2.'] },
      { row: 5, messages: ['Tiene 3 columnas y el encabezado 2.'] },
    ]);
  });

  it('un archivo ilegible falla entero, sin guardar filas, y su lote queda registrado', async () => {
    const before = saved.length;
    const report = await run('TEST_ITEMS', 'nombre,codigo\nUno,A\n');

    expect(report).toMatchObject({ status: 'FAILED', rowsTotal: null });
    expect(saved).toHaveLength(before);
    expect((await batch(report))?.errors).toEqual([
      { row: null, messages: ['El encabezado debe ser: codigo,nombre'] },
    ]);
  });

  it('si guardar falla, nada de lo escrito queda y otra transacción deja el lote FAILED', async () => {
    const code = id();
    const report = await run('TEST_FAILS', `codigo\n${code}\n`);

    expect(report).toMatchObject({ status: 'FAILED', rowsTotal: 1, rowsOk: 0, rowsFailed: 1 });
    expect(report.failure).toBe('Falla a propósito después de escribir.');
    expect(await owner(`SELECT 1 FROM food.food WHERE id = $1`, [code])).toEqual([]);
    expect((await batch(report))?.status).toBe('FAILED');

    const retry = await run('TEST_FAILS', `codigo\n${code}\n`);
    expect(retry.status).toBe('FAILED');
  });

  it('dos importaciones simultáneas del mismo archivo: una lo aplica y la otra queda como repetida', async () => {
    const content = `codigo,nombre\n${id()},Simultáneo\n`;
    const reports = await Promise.all([run('TEST_ITEMS', content), run('TEST_ITEMS', content)]);

    expect(reports.map((r) => r.status).sort()).toEqual(['COMPLETED', 'DUPLICATE']);
  });
});

describe('RN-I01 · catálogos globales sin organización', () => {
  it('actividades y fuentes: todos leen y solo SYSTEM escribe; nutrientes y grupos solo por migración', async () => {
    const insertActivity = `INSERT INTO exercise.physical_activity (code, major_heading, description_es, met)
                            VALUES ('99998', 'Correr', 'Prueba', 1.0)`;
    await withContext(
      'user',
      { orgId: id(), userId: id(), role: 'PROFESSIONAL' },
      async (client) => {
        const { rows } = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM exercise.physical_activity`,
        );
        expect(rows[0]?.n).toBeGreaterThan(0);
        expect(await errorCode(client, insertActivity)).toBe(PG.insufficientPrivilege);
        expect(
          (await client.query(`UPDATE exercise.physical_activity SET met = 1 WHERE code = '12050'`))
            .rowCount,
        ).toBe(0);
        expect(
          (
            await client.query(
              `UPDATE food.source SET imported_at = now() WHERE code = 'TPCA_2017'`,
            )
          ).rowCount,
        ).toBe(0);
        expect(await errorCode(client, `UPDATE food.source SET license = 'x'`)).toBe(
          PG.insufficientPrivilege,
        );
      },
    );
    await withContext('user', { role: 'SYSTEM' }, async (client) => {
      expect(await errorCode(client, insertActivity)).toBeUndefined();
      expect(
        (await client.query(`UPDATE food.source SET imported_at = now() WHERE code = 'TPCA_2017'`))
          .rowCount,
      ).toBe(1);
      expect(
        await errorCode(
          client,
          `INSERT INTO food.nutrient (code, name_es, unit, display_order) VALUES ('X', 'x', 'g', 99)`,
        ),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(
          client,
          `INSERT INTO food.food_group (code, source_code, name_es) VALUES ('X', 'ORG', 'x')`,
        ),
      ).toBe(PG.insufficientPrivilege);
    });
  });

  it('factores de cocción: la organización lee los globales y no los escribe; solo SYSTEM', async () => {
    const food = (
      await owner<{ id: string }>(
        `SELECT id FROM food.food WHERE organization_id IS NULL AND source_food_code = 'A3' LIMIT 1`,
      )
    )[0]?.id;
    const insertGlobal = `INSERT INTO food.cooking_factor (id, organization_id, food_id, source_code, name_es,
                                                          cooking_method_es, cooked_to_raw_factor)
                          VALUES ('${id()}', NULL, '${String(food)}', 'TAFERA_2016', 'Prueba', 'Sancochado', 1)`;
    await withContext(
      'user',
      { orgId: id(), userId: id(), role: 'PROFESSIONAL' },
      async (client) => {
        expect(await errorCode(client, insertGlobal)).toBe(PG.insufficientPrivilege);
      },
    );
    await withContext('user', { role: 'SYSTEM' }, async (client) => {
      expect(await errorCode(client, insertGlobal)).toBeUndefined();
    });
  });

  it('la lista de intercambio de demostración está cargada y rotulada como provisional (R4)', async () => {
    const lists = await owner(
      `SELECT l.code, l.version, l.provisional, l.status,
              string_agg(g.code || ':' || g.cho_g::float || '/' || g.protein_g::float || '/' || g.fat_g::float,
                         ' ' ORDER BY g.display_order) AS groups
       FROM food.exchange_list l JOIN food.exchange_group g ON g.exchange_list_id = l.id
       WHERE l.code = 'DEMO' GROUP BY l.id`,
    );
    expect(lists).toEqual([
      {
        code: 'DEMO',
        version: '1.0.0',
        provisional: true,
        status: 'PUBLISHED',
        groups: 'VEG:5/2/0 FRU:15/0/0 MILK:12/8/0 STA:15/3/1 MEAT:0/7/2 FAT:0/0/5',
      },
    ]);
  });
});

describe('CLI · quién inicia los lotes', () => {
  it('solo un PLATFORM_ADMIN activo, buscado por su correo normalizado', async () => {
    const admin = id();
    const professional = id();
    await owner(
      `INSERT INTO iam.user_account (id, email, display_name, status, is_platform_admin)
       VALUES ($1, $2, 'Plataforma de prueba', 'ACTIVE', true), ($3, $4, 'Profesional de prueba', 'ACTIVE', false)`,
      [
        admin,
        `plataforma-${admin}@demo.test`,
        professional,
        `profesional-${professional}@demo.test`,
      ],
    );

    await expect(platformAdmin(moduleRef, ` PLATAFORMA-${admin}@demo.test `)).resolves.toBe(admin);
    await expect(platformAdmin(moduleRef, `profesional-${professional}@demo.test`)).rejects.toThrow(
      'no es la cuenta activa de un administrador de plataforma',
    );
    await expect(platformAdmin(moduleRef, 'nadie@demo.test')).rejects.toThrow(
      'no es la cuenta activa de un administrador de plataforma',
    );
  });
});
