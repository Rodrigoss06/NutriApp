import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P13 (PR 2) · la app del paciente por /me, contra PostgreSQL como app_user: Luis acepta su invitación, ve su plan por
 * intercambios y registra desde él (RN-G05, RN-G06), fuera del plan desde el catálogo, agua, notas y peso. Un reintento con el
 * mismo clientId no duplica (RN-G08), la ventana de 3 días manda (RN-G10), corregir y anular no borran (RN-G12), y el
 * profesional no registra por el paciente (RN-G01). Los ajustes de su app y su mensaje del día salen de content (RF-27).
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
const PASSWORD = 'un-cielo-gris-sobre-lima';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let prescriptionId: string;
let planId: string;
const foods: Record<string, string> = {};

interface Plan {
  id: string;
  version: number;
  meals: {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Record<string, number>;
  }[];
}

interface MePlan {
  plan: {
    planId: string;
    modality: string;
    meals: {
      id: string;
      slotCode: string;
      options: {
        kind: string;
        groupCode: string;
        servings: number;
        foods: { foodId: string; gramsPerServing: number }[];
      }[];
    }[];
  } | null;
}

interface FoodLog {
  id: string;
  clientId: string;
  localDate: string;
  itemType: string;
  exchangeGroupCode: string | null;
  servings: number | null;
  grams: number | null;
  kcal: number | null;
  choG: number | null;
  proteinG: number | null;
  fatG: number | null;
  inPlan: boolean;
  status: string;
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** Una fecha a días de hoy en la zona horaria del paciente, America/Lima por defecto (RN-G04). */
const day = (offset = 0): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offset * 86_400_000));

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

/** G-18 con un alimento propio de cada grupo, de 50 g por porción, en cada tiempo donde el grupo tiene intercambios. */
async function publishedPlan(): Promise<string> {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
    cookie,
  );
  let plan = created.body as Plan;
  const body = (allowed: boolean) => ({
    modality: 'EXCHANGES',
    fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
    overrides: {},
    meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
      slotCode,
      name,
      timeOfDay,
      sharePct,
      allowedFoods: allowed
        ? GROUPS.filter((group) => (servings[group] ?? 0) > 0).map((group) => ({
            groupCode: group,
            foodId: foods[group],
            grams: 50,
            householdText: '1 porción',
          }))
        : [],
    })),
    splitOverrides: {},
    hydrationTargetMl: 2_500,
    instructions: 'Tomar agua durante el día.',
  });
  for (const allowed of [false, true]) {
    const saved = await harness
      .put(`/nutrition-plans/${plan.id}`, body(allowed), cookie)
      .set('If-Match', String(plan.version));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    plan = saved.body as Plan;
  }
  const published = await harness
    .post(`/nutrition-plans/${plan.id}/publish`, undefined, cookie)
    .set('If-Match', String(plan.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.plans');
  return plan.id;
}

/** El acceso a la app (RN-A06): invitación por correo, cada finalidad que falta y la sesión PATIENT. */
async function appSession(): Promise<string> {
  const email = `luis-${id()}@demo.test`;
  const invited = await harness.post(`/patients/${patientId}/invitation`, { email }, cookie);
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(email);
  const inspected = await harness.post('/invitations/inspect', { token });
  const consents = (inspected.body as { consents: { id: string }[] }).consents.map((c) => c.id);
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: consents,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  return sessionCookie(accepted);
}

const logFood = (body: object, who = patientCookie) => harness.post('/me/food-logs', body, who);

/** El desayuno del plan: el primer grupo con intercambios y su primer alimento permitido. */
async function breakfastPick() {
  const plan = (await harness.get('/me/plan', patientCookie)).body as MePlan;
  const breakfast = plan.plan?.meals.find((meal) => meal.slotCode === 'BREAKFAST');
  const option = breakfast?.options[0];
  const food = option?.foods[0];
  if (!breakfast || !option || !food) throw new Error('El plan no tiene desayuno.');
  return { breakfast, option, food };
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const luis = await luisWithPrescription(harness, org);
  patientId = luis.patientId;
  prescriptionId = luis.prescriptionId;
  for (const group of GROUPS) {
    const created = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (app)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 150, PROCNT: 10, FAT: 5, CHOCDF: 15, FE: 2 },
      },
      cookie,
    );
    foods[group] = (created.body as { id: string }).id;
  }
  planId = await publishedPlan();
  patientCookie = await appSession();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-28 · RN-G05 · RN-G06 · registrar desde el plan', () => {
  it('el plan por tiempos, con cada grupo, sus porciones y sus alimentos permitidos', async () => {
    const response = await harness.get('/me/plan', patientCookie);

    expect(response.status).toBe(200);
    const { plan } = response.body as MePlan;
    expect(plan).toMatchObject({ planId, modality: 'EXCHANGES' });
    const breakfast = plan?.meals.find((meal) => meal.slotCode === 'BREAKFAST');
    expect(breakfast?.options.length).toBeGreaterThan(0);
    expect(breakfast?.options[0]).toMatchObject({
      kind: 'EXCHANGE',
      foods: [{ gramsPerServing: 50 }],
    });
  });

  it('tiempo, alimento y porción por defecto: suma los valores del grupo por porción (guía §7.1)', async () => {
    const { breakfast, option, food } = await breakfastPick();
    const [row] = await owner<{
      snapshot: { exchangeList: { groups: { code: string; kcal: number; choG: number }[] } };
    }>(`SELECT snapshot FROM nutrition.plan WHERE id = $1`, [planId]);
    const group = row?.snapshot.exchangeList.groups.find((g) => g.code === option.groupCode);

    const response = await logFood({
      clientId: id(),
      localDate: day(),
      source: {
        kind: 'EXCHANGE',
        mealId: breakfast.id,
        groupCode: option.groupCode,
        foodId: food.foodId,
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const [record] = (response.body as { records: FoodLog[] }).records;
    expect(record).toMatchObject({
      itemType: 'EXCHANGE',
      exchangeGroupCode: option.groupCode,
      servings: option.servings,
      grams: 50 * option.servings,
      inPlan: true,
      status: 'ACTIVE',
    });
    expect(record?.kcal).toBeCloseTo((group?.kcal ?? 0) * option.servings, 1);
    expect(record?.choG).toBeCloseTo((group?.choG ?? 0) * option.servings, 2);
  });

  it('fuera del plan, desde el catálogo: queda marcado y lleva los nutrientes por sus gramos', async () => {
    const response = await logFood({
      clientId: id(),
      localDate: day(),
      source: { kind: 'CATALOG', mealSlotCode: 'AFTERNOON', foodId: foods.FRU, grams: 200 },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect((response.body as { records: FoodLog[] }).records[0]).toMatchObject({
      itemType: 'FOOD',
      inPlan: false,
      grams: 200,
      kcal: 300,
      choG: 30,
      proteinG: 20,
      fatG: 10,
    });
  });

  it('lo que no está en el plan no se registra como del plan: 422 con RN-G05', async () => {
    const { breakfast, option } = await breakfastPick();
    const response = await logFood({
      clientId: id(),
      localDate: day(),
      source: { kind: 'EXCHANGE', mealId: breakfast.id, groupCode: option.groupCode, foodId: id() },
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-TRK-004', rule: 'RN-G05' });
  });
});

describe('RN-G08 · reenviar el mismo registro no lo duplica', () => {
  it('el mismo clientId devuelve lo de la primera vez, con 200, y en la base queda uno', async () => {
    const { breakfast, option, food } = await breakfastPick();
    const body = {
      clientId: id(),
      localDate: day(),
      source: {
        kind: 'EXCHANGE',
        mealId: breakfast.id,
        groupCode: option.groupCode,
        foodId: food.foodId,
      },
    };

    const first = await logFood(body);
    const again = await logFood(body);
    const withKey = await logFood(body).set('Idempotency-Key', `retry-${id()}`);

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(withKey.status).toBe(200);
    const firstId = (first.body as { records: FoodLog[] }).records[0]?.id;
    expect((again.body as { records: FoodLog[] }).records.map((r) => r.id)).toEqual([firstId]);
    const rows = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM tracking.food_log WHERE patient_id = $1 AND client_id = $2`,
      [patientId, body.clientId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('el agua, una nota y el peso tampoco se duplican', async () => {
    const water = { clientId: id(), localDate: day(), volumeMl: 250 };
    expect((await harness.post('/me/hydration-logs', water, patientCookie)).status).toBe(201);
    expect((await harness.post('/me/hydration-logs', water, patientCookie)).status).toBe(200);
    const note = { clientId: id(), localDate: day(), body: 'Me costó la cena.' };
    expect((await harness.post('/me/notes', note, patientCookie)).status).toBe(201);
    expect((await harness.post('/me/notes', note, patientCookie)).status).toBe(200);
    const weight = { clientId: id(), localDate: day(), metricCode: 'BODY_WEIGHT', value: 79.4 };
    expect((await harness.post('/me/metrics', weight, patientCookie)).status).toBe(201);
    expect((await harness.post('/me/metrics', weight, patientCookie)).status).toBe(200);
  });
});

describe('RN-G10 · la ventana de registros', () => {
  it('un día futuro no; uno de hace 3 días sí; uno de hace 4, cerrado', async () => {
    const water = (localDate: string) =>
      harness.post(
        '/me/hydration-logs',
        { clientId: id(), localDate, volumeMl: 200 },
        patientCookie,
      );

    const future = await water(day(1));
    expect(future.status).toBe(422);
    expect(future.body).toMatchObject({ code: 'NC-TRK-001', rule: 'RN-G10' });
    expect((await water(day(-3))).status).toBe(201);
    const closed = await water(day(-4));
    expect(closed.status).toBe(422);
    expect(closed.body).toMatchObject({ code: 'NC-TRK-002', rule: 'RN-G10' });
  });
});

describe('RN-G12 · corregir o anular no borra', () => {
  it('corregir anula el anterior, que apunta al nuevo; anular deja el registro anulado y fuera del día', async () => {
    const { breakfast, option, food } = await breakfastPick();
    const created = await logFood({
      clientId: id(),
      localDate: day(),
      source: {
        kind: 'EXCHANGE',
        mealId: breakfast.id,
        groupCode: option.groupCode,
        foodId: food.foodId,
      },
    });
    const original = (created.body as { records: FoodLog[] }).records[0] as FoodLog;

    const corrected = await harness.post(
      `/me/food-logs/${original.id}/correct`,
      {
        clientId: id(),
        source: {
          kind: 'EXCHANGE',
          mealId: breakfast.id,
          groupCode: option.groupCode,
          foodId: food.foodId,
          servings: 0.5,
        },
      },
      patientCookie,
    );
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);
    const replacement = (corrected.body as { records: FoodLog[] }).records[0] as FoodLog;
    expect(replacement.servings).toBe(0.5);
    const [old] = await owner<{ status: string; replaced_by_id: string }>(
      `SELECT status, replaced_by_id FROM tracking.food_log WHERE id = $1`,
      [original.id],
    );
    expect(old).toEqual({ status: 'VOIDED', replaced_by_id: replacement.id });

    const voided = await harness.post(
      `/me/food-logs/${replacement.id}/void`,
      undefined,
      patientCookie,
    );
    expect(voided.status).toBe(200);
    expect((voided.body as FoodLog).status).toBe('VOIDED');
    const twice = await harness.post(
      `/me/food-logs/${replacement.id}/void`,
      undefined,
      patientCookie,
    );
    expect(twice.body).toMatchObject({ code: 'NC-TRK-006', rule: 'RN-G12' });

    const today = (await harness.get(`/me/days/${day()}`, patientCookie)).body as {
      foods: FoodLog[];
      editable: boolean;
    };
    expect(today.editable).toBe(true);
    expect(today.foods.map((f) => f.id)).not.toContain(original.id);
    expect(today.foods.map((f) => f.id)).not.toContain(replacement.id);
  });
});

describe('RF-27 · RF-28 · Hoy', () => {
  it('la meta del día frente a lo registrado y el agua; sin programa, sin sesiones', async () => {
    const response = await harness.get('/me/today', patientCookie);

    expect(response.status).toBe(200);
    const today = response.body as {
      localDate: string;
      editWindowDays: number;
      target: { kcal: number; waterMl: number | null } | null;
      consumed: { kcal: { value: number | null; known: number } };
      waterMl: number;
      plan: { planId: string } | null;
      sessions: unknown;
    };
    expect(today).toMatchObject({
      localDate: day(),
      editWindowDays: 3,
      plan: { planId },
      sessions: null,
    });
    expect(today.target?.waterMl).toBe(2_500);
    expect(today.consumed.kcal.value).toBeGreaterThan(0);
    expect(today.waterMl).toBeGreaterThanOrEqual(250);
  });
});

describe('RN-G01 · solo el paciente registra sobre sí mismo', () => {
  it('una sesión del profesional no entra a /me: 403', async () => {
    const response = await logFood(
      { clientId: id(), localDate: day(), source: { kind: 'MENU', mealId: id(), option: 'A' } },
      cookie,
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NC-PLT-013' });
  });

  it('el registro de otro paciente no existe para él: 404', async () => {
    const [other] = await owner<{ id: string }>(
      `SELECT id FROM tracking.food_log WHERE patient_id <> $1 LIMIT 1`,
      [patientId],
    );
    const target = other?.id ?? id();
    const response = await harness.post(`/me/food-logs/${target}/void`, undefined, patientCookie);
    expect(response.status).toBe(404);
  });
});

describe('RF-27 · la app del paciente: ajustes y mensaje del día', () => {
  it('sin ajustes, los de por defecto; el equipo cambia el tema y el peso, y la app lo ve', async () => {
    const defaults = (await harness.get('/me/app', patientCookie)).body as {
      allowWeightLog: boolean;
      themeColor: string | null;
    };
    expect(defaults).toMatchObject({ allowWeightLog: true, themeColor: null });

    const saved = await harness.put(
      `/patients/${patientId}/app-settings`,
      {
        themeColor: '#1F8A70',
        welcomeMessage: 'Vamos paso a paso.',
        enabledSections: ['NUTRITION', 'HYDRATION', 'NOTES'],
        allowWeightLog: false,
      },
      cookie,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await harness.get('/me/app', patientCookie)).body).toMatchObject({
      themeColor: '#1f8a70',
      welcomeMessage: 'Vamos paso a paso.',
      enabledSections: ['NUTRITION', 'HYDRATION', 'NOTES'],
      allowWeightLog: false,
    });

    const weight = await harness.post(
      '/me/metrics',
      { clientId: id(), localDate: day(), metricCode: 'BODY_WEIGHT', value: 79 },
      patientCookie,
    );
    expect(weight.body).toMatchObject({ code: 'NC-TRK-007' });
  });

  it('el mensaje del paciente va antes que el de todos; fuera del equipo de atención no existe', async () => {
    const general = await harness.post(
      '/motivational-messages',
      { body: 'Cada día cuenta.' },
      org.staff.owner.cookie,
    );
    expect(general.status, JSON.stringify(general.body)).toBe(201);
    expect((await harness.get('/me/app', patientCookie)).body).toMatchObject({
      message: { body: 'Cada día cuenta.' },
    });
    const own = await harness.post(
      `/patients/${patientId}/motivational-messages`,
      { body: 'Luis, vas muy bien.' },
      cookie,
    );
    expect(own.status).toBe(201);
    expect((await harness.get('/me/app', patientCookie)).body).toMatchObject({
      message: { body: 'Luis, vas muy bien.' },
    });

    const outsider = await harness.put(
      `/patients/${patientId}/app-settings`,
      { themeColor: null, welcomeMessage: null, enabledSections: [], allowWeightLog: true },
      org.staff.outsider.cookie,
    );
    expect(outsider.status).toBe(404);
    const professional = await harness.post(
      '/motivational-messages',
      { body: 'Para todos.' },
      org.staff.responsible.cookie,
    );
    expect(professional.status).toBe(403);
  });

  it('RN-B03: el cambio de los ajustes queda en la auditoría, con sus campos y sin sus valores', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{ action: string; changed_fields: string[] }>(
      `SELECT action, changed_fields FROM audit.audit_log
       WHERE resource_type = 'content.patient_app_setting' AND patient_id = $1`,
      [patientId],
    );
    expect(rows).toEqual([
      {
        action: 'UPDATE',
        changed_fields: ['theme_color', 'welcome_message', 'enabled_sections', 'allow_weight_log'],
      },
    ]);
  });
});

describe('02 §8 · cada registro deja su evento para la analítica', () => {
  it('tracking.food.logged lleva el paciente, el día y si fue del plan; nunca lo que comió', async () => {
    const events = await owner<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM platform.outbox_event WHERE event_type = 'tracking.food.logged'
       AND payload->>'patientId' = $1 ORDER BY id LIMIT 1`,
      [patientId],
    );
    expect(events[0]?.payload).toEqual({ patientId, localDate: day(), inPlan: true });
  });
});

describe('06 §5 · RN-G08 · los POST de la app llevan Idempotency-Key', () => {
  const NOTE = () => ({ clientId: id(), localDate: day(), body: 'Con la clave.' });

  it('sin la cabecera, 400 y no se registra nada', async () => {
    const note = NOTE();

    const response = await harness.postWithoutIdempotencyKey('/me/notes', note, patientCookie);

    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('NC-PLT-004');
    expect(
      await owner(`SELECT 1 FROM tracking.note_log WHERE client_id = $1`, [note.clientId]),
    ).toEqual([]);
  });

  it('también al anular; leer no la necesita', async () => {
    const response = await harness.postWithoutIdempotencyKey(
      `/me/hydration-logs/${id()}/void`,
      undefined,
      patientCookie,
    );
    expect(response.status).toBe(400);
    expect((await harness.get('/me/today', patientCookie)).status).toBe(200);
  });

  it('con la misma clave y el mismo cuerpo, repite la respuesta sin ejecutar otra vez', async () => {
    const note = NOTE();
    const key = `test:${id()}`;
    const send = () =>
      harness
        .postWithoutIdempotencyKey('/me/notes', note, patientCookie)
        .set('Idempotency-Key', key);

    const first = await send();
    const again = await send();

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBeDefined();
    expect((again.body as { id: string }).id).toBe((first.body as { id: string }).id);
  });

  it('el profesional sigue recibiendo 403 antes de que se mire la clave', async () => {
    const response = await harness.postWithoutIdempotencyKey('/me/notes', NOTE(), cookie);
    expect(response.status).toBe(403);
  });
});

describe('RN-A02 · con la organización en solo lectura no se registra', () => {
  it('registrar responde 422 con RN-A02; leer sigue', async () => {
    await owner(`UPDATE tenancy.organization SET status = 'READ_ONLY' WHERE id = $1`, [
      org.organizationId,
    ]);
    try {
      const response = await harness.post(
        '/me/hydration-logs',
        { clientId: id(), localDate: day(), volumeMl: 200 },
        patientCookie,
      );
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'NC-TEN-014', rule: 'RN-A02' });
      expect((await harness.get('/me/today', patientCookie)).status).toBe(200);
    } finally {
      await owner(`UPDATE tenancy.organization SET status = 'ACTIVE' WHERE id = $1`, [
        org.organizationId,
      ]);
    }
  });
});
