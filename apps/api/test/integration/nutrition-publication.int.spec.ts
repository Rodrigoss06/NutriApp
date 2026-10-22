import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobRegistry } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P9 (PR 2) · publicar un plan por intercambios por HTTP contra PostgreSQL como app_user: lo que falta para publicar
 * (RN-E13, RN-G05), el snapshot inmutable con su hash (RN-E15), una versión nueva que reemplaza a la anterior
 * (RN-E14) y la copia del plan vigente con la meta de cada día en tracking (RN-G03), idempotente.
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
const foods: Record<string, string> = {};

interface Plan {
  id: string;
  lineageId: string;
  versionNo: number;
  status: string;
  version: number;
  validFrom: string | null;
  publishedAt: string | null;
  meals: {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Record<string, number>;
  }[];
  totals: { kcal: number };
  hydrationTargetMl: number | null;
  publishProblems: string[];
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** Hoy en la zona horaria del paciente, America/Lima por defecto (RN-G04). */
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/** G-18 con un alimento permitido de cada grupo en cada tiempo donde tiene intercambios (RN-G05). */
const readyBody = (plan: Plan, hydrationTargetMl = 2_500) => ({
  fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
  overrides: {},
  meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
    slotCode,
    name,
    timeOfDay,
    sharePct,
    allowedFoods: GROUPS.filter((group) => (servings[group] ?? 0) > 0).map((group) => ({
      groupCode: group,
      foodId: foods[group],
      grams: 50,
      householdText: null,
    })),
  })),
  splitOverrides: {},
  hydrationTargetMl,
  instructions: 'Tomar agua durante el día.',
});

/** G-18 sin alimentos ni hidratación: lo que se guarda antes de saber el reparto de cada tiempo. */
const bareBody = (plan: Plan) => ({
  ...readyBody(plan),
  meals: readyBody(plan).meals.map((meal) => ({ ...meal, allowedFoods: [] })),
  hydrationTargetMl: null,
});

const put = (plan: Plan, body: object) =>
  harness.put(`/nutrition-plans/${plan.id}`, body, cookie).set('If-Match', String(plan.version));
const publish = (plan: Plan) =>
  harness
    .post(`/nutrition-plans/${plan.id}/publish`, undefined, cookie)
    .set('If-Match', String(plan.version));

/** Un borrador con G-18 y su reparto, y luego listo para publicar. */
async function readyDraft(): Promise<Plan> {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
    cookie,
  );
  const draft = created.body as Plan;
  const g18 = (await put(draft, bareBody(draft))).body as Plan;
  const ready = await put(g18, readyBody(g18));
  expect(ready.status, JSON.stringify(ready.body)).toBe(200);
  return ready.body as Plan;
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  for (const group of GROUPS) {
    const created = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (publicación)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 150, PROCNT: 10, FAT: 5, CHOCDF: 15 },
      },
      cookie,
    );
    foods[group] = (created.body as { id: string }).id;
  }
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-E13 · RN-G05 · lo que falta para publicar', () => {
  it('sin hidratación ni alimentos permitidos no se publica: 422 con cada problema', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    const draft = created.body as Plan;
    const response = await publish(draft);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-NUT-012' });
    expect((response.body as { details: { problems: string[] } }).details.problems).toContain(
      'Falta la meta de hidratación (RN-E13).',
    );
  });
});

describe('RF-23 · RN-E14 · RN-E15 · publicar y reemplazar', () => {
  let first: Plan;

  it('publicar congela el snapshot con su hash y vale desde hoy; publicado no se edita', async () => {
    const draft = await readyDraft();
    expect(draft.publishProblems).toEqual([]);
    const response = await publish(draft);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    first = response.body as Plan;

    expect(first).toMatchObject({ status: 'PUBLISHED', validFrom: today(), publishProblems: [] });
    expect(first.publishedAt).not.toBeNull();
    expect(first.totals.kcal).toBe(1889);
    const [row] = await owner<{
      schema: number;
      hash_bytes: number;
      kcal: number;
      by: string;
    }>(
      `SELECT snapshot_schema_version AS schema, length(snapshot_hash) AS hash_bytes,
              (snapshot->'meals'->0->'allowedFoods'->0->'nutrientsPer100g'->>'ENERC_KCAL')::float8 AS kcal,
              published_by AS by
       FROM nutrition.plan WHERE id = $1`,
      [first.id],
    );
    expect(row).toEqual({ schema: 1, hash_bytes: 32, kcal: 150, by: org.staff.responsible.userId });

    const edit = await harness
      .put(`/nutrition-plans/${first.id}`, readyBody(first), cookie)
      .set('If-Match', String(first.version));
    expect(edit.status).toBe(409);
    expect(edit.body).toMatchObject({ code: 'NC-NUT-007', rule: 'RN-E15' });
    expect((await publish(first)).status).toBe(409);
    const preview = await harness.post(
      `/nutrition-plans/${first.id}/preview`,
      readyBody(first),
      cookie,
    );
    expect(preview.status).toBe(409);
    expect(preview.body).toMatchObject({ code: 'NC-NUT-007', rule: 'RN-E15' });

    const timeline = await harness.get(`/patients/${patientId}/timeline`, cookie);
    const items = (timeline.body as { items: { kind: string; refId: string; label: string }[] })
      .items;
    expect(items.find((i) => i.refId === first.id)).toMatchObject({
      kind: 'NUTRITION_PLAN_PUBLISHED',
      label: '1',
    });
  });

  it('RN-G03 · tracking guarda la copia del plan y la meta de hoy; entregar otra vez no duplica', async () => {
    await harness.deliver('tracking.plans');
    await harness.deliver('tracking.plans');

    const views = await owner<{ plan: string; effective: string }>(
      `SELECT nutrition_plan_id AS plan, to_char(effective_from, 'YYYY-MM-DD') AS effective
       FROM tracking.active_plan_view WHERE patient_id = $1`,
      [patientId],
    );
    expect(views).toEqual([{ plan: first.id, effective: today() }]);
    const targets = await owner<{ plan: string; kcal: number; water: number }>(
      `SELECT nutrition_plan_id AS plan, kcal::float8 AS kcal, water_ml AS water
       FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    expect(targets).toEqual([{ plan: first.id, kcal: 1834.5, water: 2_500 }]);
  });

  it('una versión nueva copia el plan, se edita y al publicarse reemplaza a la anterior; los días pasados no cambian', async () => {
    const revised = await harness.post(`/nutrition-plans/${first.id}/revisions`, undefined, cookie);
    expect(revised.status, JSON.stringify(revised.body)).toBe(201);
    const draft = revised.body as Plan;
    expect(draft).toMatchObject({ status: 'DRAFT', versionNo: 2, lineageId: first.lineageId });
    expect(draft.hydrationTargetMl).toBe(2_500);
    const again = await harness.post(`/nutrition-plans/${first.id}/revisions`, undefined, cookie);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'NC-NUT-013', details: { draftId: draft.id } });

    // Ayer, con el plan anterior (RN-G03): la meta guardada ese día no se reescribe.
    await owner(
      `INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, nutrition_plan_id, kcal, water_ml)
       VALUES ($1, $2::date - 1, $3, $4, 1834.5, 2500)`,
      [patientId, today(), org.organizationId, first.id],
    );
    const edited = (await put(draft, readyBody(draft, 3_000))).body as Plan;
    const published = await publish(edited);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const second = published.body as Plan;
    await harness.deliver('tracking.plans');

    const statuses = await owner<{ id: string; status: string }>(
      `SELECT id, status FROM nutrition.plan WHERE lineage_id = $1 ORDER BY version_no`,
      [first.lineageId],
    );
    expect(statuses).toEqual([
      { id: first.id, status: 'SUPERSEDED' },
      { id: second.id, status: 'PUBLISHED' },
    ]);
    const targets = await owner<{ day: string; plan: string; water: number }>(
      `SELECT to_char(local_date, 'YYYY-MM-DD') AS day, nutrition_plan_id AS plan, water_ml AS water
       FROM tracking.daily_target WHERE patient_id = $1 ORDER BY local_date`,
      [patientId],
    );
    expect(targets.at(-2)).toMatchObject({ plan: first.id, water: 2_500 });
    expect(targets.at(-1)).toEqual({ day: today(), plan: second.id, water: 3_000 });
    const [view] = await owner<{ plan: string }>(
      `SELECT nutrition_plan_id AS plan FROM tracking.active_plan_view WHERE patient_id = $1`,
      [patientId],
    );
    expect(view?.plan).toBe(second.id);

    const history = await harness.get(`/patients/${patientId}/nutrition-plans`, cookie);
    const plans = (
      history.body as { plans: { id: string; status: string; validFrom: string | null }[] }
    ).plans;
    expect(plans.find((p) => p.id === first.id)).toMatchObject({ status: 'SUPERSEDED' });
    expect(plans.find((p) => p.id === second.id)).toMatchObject({
      status: 'PUBLISHED',
      validFrom: today(),
    });
    // El reemplazado se sigue leyendo de su snapshot, tal como se publicó.
    const old = (await harness.get(`/nutrition-plans/${first.id}`, cookie)).body as Plan;
    expect(old).toMatchObject({ status: 'SUPERSEDED', hydrationTargetMl: 2_500 });

    await harness.deliver('audit.events');
    const audit = await owner<{ id: string; action: string; fields: string[] | null }>(
      `SELECT resource_id AS id, action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'nutrition.plan' AND resource_id = ANY($1::uuid[]) AND action <> 'READ'`,
      [[first.id, second.id]],
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        { id: first.id, action: 'PUBLISH', fields: [] },
        { id: first.id, action: 'UPDATE', fields: ['status'] },
        { id: second.id, action: 'PUBLISH', fields: [] },
      ]),
    );
  });

  it('RN-G03 · el trabajo diario crea la meta del día que falta y no reescribe la que ya existe', async () => {
    await owner(
      `DELETE FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    const job = harness.app
      .get(JobRegistry)
      .all()
      .find((j) => j.queue === 'tracking.daily-targets');
    if (!job) throw new Error('Falta el trabajo tracking.daily-targets.');
    await job.run();
    const recreated = await owner<{ plan: string }>(
      `SELECT nutrition_plan_id AS plan FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    expect(recreated).toHaveLength(1);
    await owner(
      `UPDATE tracking.daily_target SET kcal = 1 WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    await job.run();

    const [target] = await owner<{ kcal: number }>(
      `SELECT kcal::float8 AS kcal FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    expect(target?.kcal).toBe(1);
  });
});
