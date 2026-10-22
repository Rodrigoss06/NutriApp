import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, PG, pool, withContext } from './support/database.js';
import { luisWithPrescription, patientWithConsent } from './support/luis.js';

/**
 * P9 (PR 1) · dieta por intercambios por HTTP contra PostgreSQL como app_user: el borrador toma las metas exactas de la
 * prescripción de Luis (G-17) y reproduce G-18 y G-19 con la lista DEMO; ajuste y reparto a mano, alimentos permitidos,
 * rango de adecuación de la organización (RN-E08 a RN-E10, RN-G05) y un plan publicado que ni la API ni la base dejan
 * editar (RN-E15).
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;

interface Plan {
  id: string;
  lineageId: string;
  status: string;
  version: number;
  targets: { kcal: number; choG: number; proteinG: number; fatG: number };
  exchangeList: { code: string; version: string; provisional: boolean };
  exchanges: { groupCode: string; servings: number; automatic: number; manual: boolean }[];
  meals: {
    id: string;
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Record<string, number>;
    allowedFoods: { groupCode: string; foodId: string; grams: number; foodName: string }[];
  }[];
  manualSplit: string[];
  totals: { kcal: number; choG: number; proteinG: number; fatG: number };
  adequacy: Record<'kcal' | 'cho' | 'protein' | 'fat', { pct: number; inRange: boolean }> & {
    rangePct: [number, number];
  };
  methods: { methodCode: string }[];
  publishProblems: string[];
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const draft = async (): Promise<Plan> => {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as Plan;
};

interface AllowedFood {
  groupCode: string;
  foodId: string;
  grams: number;
  householdText: string | null;
}

/** El cuerpo del PUT a partir de un plan leído: G-18 con sus tiempos, con los cambios que se pidan. */
const bodyOf = (plan: Plan, changes: Record<string, unknown> = {}) => ({
  fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
  overrides: {},
  meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct }) => ({
    slotCode,
    name,
    timeOfDay,
    sharePct,
    allowedFoods: [] as AllowedFood[],
  })),
  splitOverrides: {},
  hydrationTargetMl: null,
  instructions: null,
  ...changes,
});

const put = (plan: Plan, body: object, version = plan.version) =>
  harness.put(`/nutrition-plans/${plan.id}`, body, cookie).set('If-Match', String(version));

const ownFood = async (name: string): Promise<string> => {
  const created = await harness.post(
    '/foods',
    { name, state: 'COOKED', nutrients: { ENERC_KCAL: 150, PROCNT: 20, FAT: 5, CHOCDF: 5 } },
    cookie,
  );
  return (created.body as { id: string }).id;
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-18 · RF-19 · borrador desde la prescripción', () => {
  it('G-17: toma las metas exactas de la prescripción, la lista DEMO provisional y los tiempos de G-19', async () => {
    const plan = await draft();

    expect(plan).toMatchObject({
      status: 'DRAFT',
      version: 0,
      exchangeList: { code: 'DEMO', version: '1.0.0', provisional: true },
    });
    expect(plan.targets.proteinG).toBeCloseTo(160, 9);
    expect(Math.round(plan.targets.fatG)).toBe(51);
    expect(Math.round(plan.targets.choG)).toBe(184);
    // El objetivo encadenado sin redondear (03, tolerancia de G-18): ≈ 1834.54 kcal.
    expect(plan.targets.kcal).toBeCloseTo(1834.54, 2);
    expect(plan.meals.map((m) => [m.name, m.sharePct])).toEqual([
      ['Desayuno', 25],
      ['Media mañana', 10],
      ['Almuerzo', 35],
      ['Media tarde', 10],
      ['Cena', 20],
    ]);
    expect(plan.publishProblems).toContain('Falta la meta de hidratación (RN-E13).');
  });

  it('G-18 y G-19: 4 verduras, 3 frutas y 3 lácteos dan 6 almidones, 16 carnes y 3 grasas, repartidos por tiempos', async () => {
    const plan = await draft();
    const response = await put(plan, bodyOf(plan));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const saved = response.body as Plan;

    expect(saved.exchanges.map((e) => [e.groupCode, e.servings])).toEqual([
      ['VEG', 4],
      ['FRU', 3],
      ['MILK', 3],
      ['STA', 6],
      ['MEAT', 16],
      ['FAT', 3],
    ]);
    expect(saved.totals).toEqual({ choG: 191, proteinG: 162, fatG: 53, kcal: 1889 });
    expect(saved.adequacy.kcal.pct).toBeCloseTo(103.0, 1);
    expect(saved.adequacy.cho.pct).toBeCloseTo(103.8, 1);
    expect(saved.adequacy.protein.pct).toBeCloseTo(101.3, 1);
    expect(saved.adequacy.fat.pct).toBeCloseTo(104.0, 1);
    expect(saved.meals.map((m) => m.servings.STA)).toEqual([1, 1, 2, 1, 1]);
    expect(saved.meals.map((m) => m.servings.MEAT)).toEqual([4, 2, 5, 2, 3]);
    expect(new Set(saved.methods.map((m) => m.methodCode))).toEqual(
      new Set(['EXCHANGES_CLASSIC', 'MEAL_SPLIT_LARGEST_REMAINDER', 'ADEQUACY']),
    );
    expect(saved.version).toBe(1);
  });

  it('el ajuste y el reparto a mano se guardan marcados y se recalculan al leer (RN-E08, RN-E09)', async () => {
    const plan = await draft();
    const response = await put(
      plan,
      bodyOf(plan, { overrides: { MEAT: 15 }, splitOverrides: { MILK: [1, 0, 0, 1, 1] } }),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    const read = (await harness.get(`/nutrition-plans/${plan.id}`, cookie)).body as Plan;
    expect(read.exchanges.find((e) => e.groupCode === 'MEAT')).toEqual({
      groupCode: 'MEAT',
      servings: 15,
      automatic: 16,
      manual: true,
    });
    expect(read.totals.proteinG).toBe(155);
    expect(read.manualSplit).toEqual(['MILK']);
    expect(read.meals.map((m) => m.servings.MILK)).toEqual([1, 0, 0, 1, 1]);
    const [row] = await owner<{ manual: boolean }>(
      `SELECT is_manual AS manual FROM nutrition.plan_exchange WHERE plan_id = $1 AND group_code = 'MEAT'`,
      [plan.id],
    );
    expect(row?.manual).toBe(true);
  });

  it('alimentos permitidos con su porción, y lo que falta para publicar (RN-G05, RN-E13)', async () => {
    const rice = await ownFood('Arroz de la casa (plan)');
    const chicken = await ownFood('Pollo de la casa (plan)');
    const plan = await draft();
    const body = bodyOf(plan, { hydrationTargetMl: 2_500 });
    body.meals = body.meals.map((meal, i) =>
      i === 2
        ? {
            ...meal,
            timeOfDay: '13:00',
            allowedFoods: [
              { groupCode: 'STA', foodId: rice, grams: 30, householdText: '¼ taza' },
              { groupCode: 'MEAT', foodId: chicken, grams: 35, householdText: null },
            ],
          }
        : meal,
    );
    const response = await put(plan, body);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const saved = response.body as Plan;

    expect(saved.meals[2]).toMatchObject({
      name: 'Almuerzo',
      timeOfDay: '13:00',
      allowedFoods: [
        { groupCode: 'STA', foodId: rice, grams: 30, foodName: 'Arroz de la casa (plan)' },
        { groupCode: 'MEAT', foodId: chicken, grams: 35, foodName: 'Pollo de la casa (plan)' },
      ],
    });
    expect(saved.publishProblems).not.toContain('Falta la meta de hidratación (RN-E13).');
    expect(saved.publishProblems).toContain(
      'Almuerzo: falta al menos un alimento permitido de Verduras (RN-G05).',
    );
    expect(saved.publishProblems).not.toContain(
      'Almuerzo: falta al menos un alimento permitido de Almidones (RN-G05).',
    );
  });

  it('422 con cada problema: porcentajes, reparto a mano y alimentos donde el grupo no tiene intercambios', async () => {
    const rice = await ownFood('Arroz para el error (plan)');
    const plan = await draft();
    const meals = bodyOf(plan).meals.map((meal, i) => (i === 0 ? { ...meal, sharePct: 30 } : meal));
    const shares = await put(plan, bodyOf(plan, { meals }));
    expect(shares.status).toBe(422);
    expect(shares.body).toMatchObject({
      code: 'NC-NUT-010',
      details: {
        problems: ['Los porcentajes de los tiempos de comida suman 105: deben sumar 100 (RN-E09).'],
      },
    });

    const split = await put(plan, bodyOf(plan, { splitOverrides: { MILK: [3, 1, 0, 0, 0] } }));
    expect((split.body as { details: { problems: string[] } }).details.problems).toEqual([
      'Lácteos: el reparto suma 4 y el total del día es 3 (RN-E09).',
    ]);

    const body = bodyOf(plan, { splitOverrides: { STA: [6, 0, 0, 0, 0] } });
    body.meals = body.meals.map((meal, i) =>
      i === 1
        ? {
            ...meal,
            allowedFoods: [{ groupCode: 'STA', foodId: rice, grams: 30, householdText: null }],
          }
        : meal,
    );
    const foods = await put(plan, body);
    expect((foods.body as { details: { problems: string[] } }).details.problems).toEqual([
      'Media mañana: Almidones no tiene intercambios en este tiempo; quita sus alimentos permitidos (RN-G05).',
    ]);
  });

  it('If-Match: sin él 428; con una versión vieja 409; la prescripción de otro paciente 404; una lista que no existe 422', async () => {
    const plan = await draft();
    expect((await harness.put(`/nutrition-plans/${plan.id}`, bodyOf(plan), cookie)).status).toBe(
      428,
    );
    expect((await put(plan, bodyOf(plan))).status).toBe(200);
    const stale = await put(plan, bodyOf(plan));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-NUT-008' });

    const ana = await patientWithConsent(harness, org, {
      firstName: 'Ana',
      lastName: 'Ejemplo Sintético',
      sex: 'F',
      birthDate: '1995-02-01',
    });
    const foreign = await harness.post(
      `/patients/${ana}/nutrition-plans`,
      { energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: 'NC-NUT-001' });

    const missing = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      {
        energyPrescriptionId: prescriptionId,
        exchangeListId: '01926200-0000-7000-8000-0000000000ff',
      },
      cookie,
    );
    expect(missing.status).toBe(422);
    expect(missing.body).toMatchObject({ code: 'NC-NUT-009', rule: 'RN-E11' });
  });

  it('RN-E10 · la adecuación usa el rango de la organización', async () => {
    const plan = await draft();
    await put(plan, bodyOf(plan));
    const { owner: ownerMember } = org.staff;
    await harness.put(
      '/organization/settings/nutrition.adequacy_min_pct',
      { value: 95 },
      ownerMember.cookie,
    );
    await harness.put(
      '/organization/settings/nutrition.adequacy_max_pct',
      { value: 103 },
      ownerMember.cookie,
    );

    const read = (await harness.get(`/nutrition-plans/${plan.id}`, cookie)).body as Plan;
    expect(read.adequacy.rangePct).toEqual([95, 103]);
    expect(read.adequacy.kcal.inRange).toBe(true);
    expect(read.adequacy.cho.inRange).toBe(false);
    expect(read.adequacy.fat.inRange).toBe(false);

    await harness.put(
      '/organization/settings/nutrition.adequacy_min_pct',
      { value: 90 },
      ownerMember.cookie,
    );
    await harness.put(
      '/organization/settings/nutrition.adequacy_max_pct',
      { value: 110 },
      ownerMember.cookie,
    );
  });

  it('RF-23 · el historial del paciente y la auditoría: CREATE, UPDATE con lo que cambió y READ al abrirlo (RN-B03)', async () => {
    const plan = await draft();
    await put(plan, bodyOf(plan, { hydrationTargetMl: 2_000 }));
    await harness.get(`/nutrition-plans/${plan.id}`, cookie);
    await harness.deliver('audit.events');

    const history = await harness.get(`/patients/${patientId}/nutrition-plans`, cookie);
    const { plans } = history.body as {
      plans: { id: string; status: string; exchangeListCode: string }[];
    };
    expect(plans.find((p) => p.id === plan.id)).toMatchObject({
      status: 'DRAFT',
      exchangeListCode: 'DEMO',
    });

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'nutrition.plan' AND resource_id = $1 ORDER BY occurred_at, id`,
      [plan.id],
    );
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'READ']));
    expect(rows.find((r) => r.action === 'UPDATE')?.fields).toEqual([
      'plan_exchange',
      'hydration_target_ml',
    ]);
  });
});

describe('RN-E15 · un plan publicado no se edita, tampoco saltándose la API', () => {
  it('la API responde 409 y la base rechaza cambiar el plan o sus hijos, y un segundo borrador del mismo plan', async () => {
    const plan = await draft();
    await put(plan, bodyOf(plan));
    const { responsible } = org.staff;
    // La publicación llega en el PR 2: aquí se marca a mano, como haría ese caso de uso.
    await owner(
      `UPDATE nutrition.plan SET status = 'PUBLISHED', snapshot = '{}', snapshot_schema_version = 1,
              snapshot_hash = '\\x00', published_at = now(), published_by = $2, valid_from = current_date
       WHERE id = $1`,
      [plan.id, responsible.userId],
    );

    const response = await put(plan, bodyOf(plan), 1);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'NC-NUT-007', rule: 'RN-E15' });

    const context = {
      orgId: org.organizationId,
      userId: responsible.userId,
      role: 'PROFESSIONAL' as const,
      memberId: responsible.memberId,
    };
    await withContext('user', context, async (client) => {
      expect(
        await errorCode(client, `UPDATE nutrition.plan SET instructions = 'x' WHERE id = $1`, [
          plan.id,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `UPDATE nutrition.plan_meal SET name_es = 'x' WHERE plan_id = $1`, [
          plan.id,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `DELETE FROM nutrition.plan_exchange WHERE plan_id = $1`, [
          plan.id,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(
          client,
          `UPDATE nutrition.plan_meal_exchange SET servings = 0
           WHERE plan_meal_id IN (SELECT id FROM nutrition.plan_meal WHERE plan_id = $1)`,
          [plan.id],
        ),
      ).toBe(PG.integrityViolation);
    });

    const [row] = await owner<{ lineage: string }>(
      `SELECT lineage_id AS lineage FROM nutrition.plan WHERE id = $1`,
      [plan.id],
    );
    expect(row?.lineage).toBe(plan.lineageId);
    // Un solo borrador por plan: la versión 2 entra y una tercera en borrador no (se revierte al final).
    const client = await pool('owner').connect();
    try {
      await client.query('BEGIN');
      expect(
        await errorCode(
          client,
          `INSERT INTO nutrition.plan (id, organization_id, patient_id, lineage_id, version_no, modality,
                                       target_kcal, target_cho_g, target_protein_g, target_fat_g, created_by)
           SELECT gen_random_uuid(), organization_id, patient_id, lineage_id, 2, 'EXCHANGES', 1, 1, 1, 1, created_by
           FROM nutrition.plan WHERE id = $1`,
          [plan.id],
        ),
      ).toBeUndefined();
      expect(
        await errorCode(
          client,
          `INSERT INTO nutrition.plan (id, organization_id, patient_id, lineage_id, version_no, modality,
                                       target_kcal, target_cho_g, target_protein_g, target_fat_g, created_by)
           SELECT gen_random_uuid(), organization_id, patient_id, lineage_id, 3, 'EXCHANGES', 1, 1, 1, 1, created_by
           FROM nutrition.plan WHERE id = $1`,
          [plan.id],
        ),
      ).toBe('23505');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
