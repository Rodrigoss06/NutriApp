import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo2, type DemoApi } from '../../scripts/demo-2.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P11 (PR 5) · la semilla de la Demo 2 (scripts/demo-2.ts, decisión 4 del plan) por HTTP contra PostgreSQL como
 * app_user, con la TPCA y las medidas de la TAFERA cargadas: Luis queda con la receta de arroz con pollo, su dieta por
 * intercambios publicada (G-17 a G-19) y reemplazada por la dieta por composición, que queda vigente con su adecuación
 * en rango; las fichas de los dos planes las genera el worker. Correrla otra vez no duplica nada.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let patientId: string;
let api: DemoApi;

interface Plan {
  id: string;
  modality: 'EXCHANGES' | 'COMPOSITION' | 'WEEKLY_MENU';
  status: string;
}

const plans = async (): Promise<Plan[]> =>
  (
    (await harness.get(`/patients/${patientId}/nutrition-plans`, org.staff.responsible.cookie))
      .body as { plans: Plan[] }
  ).plans;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  // Con una línea en blanco al final, como foods.int.spec.ts: la prueba de catálogos sigue siendo la primera en
  // aplicar cada archivo tal cual.
  for (const [kind, file] of [
    ['TPCA_FOODS', 'food/tpca-2017.csv'],
    ['TAFERA_MEASURES', 'food/tafera-2016-medidas.csv'],
  ] as const) {
    const report = await harness.app.get(CatalogImporter).run({
      kind,
      fileName: file,
      content: Buffer.concat([await readFile(new URL(file, SEEDS)), Buffer.from('\n')]),
      organizationId: null,
      startedBy: id() as UserId,
    });
    expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  }
  ({ patientId } = await luisWithPrescription(harness, org));
  const { cookie } = org.staff.responsible;
  api = {
    call: async (method, path, options = {}) => {
      const request =
        method === 'GET'
          ? harness.get(path, cookie)
          : method === 'POST'
            ? harness.post(path, options.body ?? undefined, cookie)
            : harness.put(path, options.body ?? {}, cookie);
      const response = await (options.ifMatch === undefined
        ? request
        : request.set('If-Match', `"${String(options.ifMatch)}"`));
      return { status: response.status, body: response.body as unknown };
    },
  };
});

afterAll(async () => {
  await harness.stop();
});

describe('Demo 2 · la semilla de Luis', () => {
  it('deja la receta, la dieta por intercambios reemplazada y la composición vigente', async () => {
    const report = await seedDemo2(api, patientId, () => Promise.resolve());
    expect(report).toEqual({
      prescription: 'EXISTING',
      recipe: 'CREATED',
      exchanges: 'CREATED',
      composition: 'CREATED',
    });

    const all = await plans();
    expect(
      all
        .map(({ modality, status }) => ({ modality, status }))
        .sort((a, b) => a.modality.localeCompare(b.modality)),
    ).toEqual([
      { modality: 'COMPOSITION', status: 'PUBLISHED' },
      { modality: 'EXCHANGES', status: 'SUPERSEDED' },
    ]);

    const exchanges = all.find((p) => p.modality === 'EXCHANGES');
    const plan = (
      await harness.get(`/nutrition-plans/${exchanges?.id ?? ''}`, org.staff.responsible.cookie)
    ).body as {
      exchanges: { groupCode: string; servings: number }[];
      meals: { allowedFoods: { groupCode: string }[]; servings: Record<string, number> }[];
    };
    // G-18: 4 verduras, 3 frutas y 3 lácteos; el motor despeja 6 almidones, 16 carnes y 3 grasas.
    expect(Object.fromEntries(plan.exchanges.map((e) => [e.groupCode, e.servings]))).toMatchObject({
      VEG: 4,
      FRU: 3,
      MILK: 3,
      STA: 6,
      MEAT: 16,
      FAT: 3,
    });
    // Cada grupo con intercambios en un tiempo tiene sus alimentos permitidos (RN-G05).
    for (const meal of plan.meals) {
      for (const [group, servings] of Object.entries(meal.servings)) {
        if (servings > 0) expect(meal.allowedFoods.some((f) => f.groupCode === group)).toBe(true);
      }
    }

    const composition = all.find((p) => p.modality === 'COMPOSITION');
    const current = (
      await harness.get(`/nutrition-plans/${composition?.id ?? ''}`, org.staff.responsible.cookie)
    ).body as {
      hydrationTargetMl: number;
      adequacy: Record<'kcal' | 'cho' | 'protein' | 'fat', { pct: number }>;
      meals: { items: { householdText: string | null }[] }[];
    };
    expect(current.hydrationTargetMl).toBe(2_500);
    // La composición está en el rango de la organización: 90 a 110 % (RN-E10).
    for (const nutrient of ['kcal', 'cho', 'protein', 'fat'] as const) {
      expect(current.adequacy[nutrient].pct).toBeGreaterThanOrEqual(90);
      expect(current.adequacy[nutrient].pct).toBeLessThanOrEqual(110);
    }
    // Con medida casera, como el editor: la cantidad y la medida de la TAFERA (RN-E12).
    expect(current.meals.flatMap((m) => m.items.map((i) => i.householdText))).toContain(
      '1 × Unidad pequeña',
    );
  });

  it('RF-24 · las fichas de los dos planes las genera el worker al publicar', async () => {
    await harness.deliver('documents.sheets');
    const { rows } = await pool('owner').query<{ kind: string }>(
      `SELECT d.kind FROM documents.generated_document d
       JOIN nutrition.plan p ON p.id = d.source_id
       WHERE p.patient_id = $1 ORDER BY d.kind`,
      [patientId],
    );
    expect(rows.map((r) => r.kind)).toEqual(['EXCHANGE_DIET', 'WEEKLY_MENU']);
  });

  it('correrla otra vez no duplica nada', async () => {
    const before = await plans();
    expect(await seedDemo2(api, patientId, () => Promise.resolve())).toEqual({
      prescription: 'EXISTING',
      recipe: 'EXISTING',
      exchanges: 'EXISTING',
      composition: 'EXISTING',
    });
    expect(await plans()).toEqual(before);
    const { rows } = await pool('owner').query<{ count: string }>(
      `SELECT count(*) FROM food.recipe WHERE organization_id = $1 AND name_es = 'Arroz con pollo'`,
      [org.organizationId],
    );
    expect(rows[0]?.count).toBe('1');
  });
});
