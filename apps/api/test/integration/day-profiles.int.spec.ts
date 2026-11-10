import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobRegistry } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P14.5 (PR 1c) · perfiles de día del plan por HTTP contra PostgreSQL como app_user (07 §2 y §8; P-20, respuestas de Jeremy;
 * RN-E07, RN-G03, RN-E15; ADR-100). Entrenamiento es la meta de la prescripción; Descanso y los perfiles propios llevan sus
 * gramos y las kcal salen de ellos (P-20.2). La meta de cada día es la del perfil que pide el programa vigente: el de la
 * sesión, Descanso sin sesión y la prescripción sin programa.
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
/** G-17: la meta exacta de Luis, la de Entrenamiento (≈ 1834.54 kcal). */
const LUIS_KCAL = 1834.5357142857142;
/** Su descanso y un día alto, con 160 g de proteína y 51 g de grasa (lo de la prescripción, como sugiere P-20.1). */
const REST = { code: 'REST', name: 'Descanso', choG: 120, proteinG: 160, fatG: 51 };
const HIGH = { code: 'ALTO', name: 'Alto', choG: 250, proteinG: 160, fatG: 51 };
/** Atwater con los gramos: mandan los gramos (P-20.2). */
const REST_KCAL = 120 * 4 + 160 * 4 + 51 * 9;
const HIGH_KCAL = 250 * 4 + 160 * 4 + 51 * 9;

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
let exerciseId: string;
const foods: Record<string, string> = {};

interface Profile {
  code: string;
  name: string;
  kcal: number;
  choG: number;
  method: { methodCode: string; methodVersion: string };
}

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
  targets: { kcal: number };
  dayProfiles: Profile[];
}

interface Program {
  id: string;
  version: number;
  document: { mesocycles: { weeks: { id: string }[] }[] };
}

interface Target {
  kcal: number;
  kind: string | null;
  code: string | null;
  name: string | null;
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

/** G-18 con un alimento permitido de cada grupo en cada tiempo donde tiene intercambios (RN-G05). */
const readyBody = (plan: Plan, dayProfiles: object[]) => ({
  modality: 'EXCHANGES',
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
  hydrationTargetMl: 2_500,
  instructions: null,
  dayProfiles,
});

const put = (plan: Plan, body: object) =>
  harness.put(`/nutrition-plans/${plan.id}`, body, cookie).set('If-Match', String(plan.version));

/** La meta guardada de hoy: la de alimentación, el tipo del día y el perfil con que se fijó. */
async function todayTarget(): Promise<Target | undefined> {
  const [row] = await owner<Target>(
    `SELECT kcal::float8 AS kcal, day_kind AS kind, day_profile_code AS code, day_profile_name AS name
     FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
    [patientId, day()],
  );
  return row;
}

/** Un programa a mano de una semana con una sola sesión, que va el primer día (07 §8), con su perfil de día (P-20.4). */
async function publishProgram(startDate: string, dayProfileCode: string | null): Promise<void> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: `Una sesión desde ${startDate}`, startDate },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const draft = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${draft.id}/mesocycles`, { name: 'Base', weeks: 1 }, cookie)
    .set('If-Match', String(draft.version));
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  const program = added.body as Program;
  const weekId = program.document.mesocycles[0]?.weeks[0]?.id ?? '';
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  const saved = await harness
    .put(
      `/training-programs/${program.id}/weeks/${weekId}`,
      {
        sessions: [
          { name: 'Sesión 1', dayProfileCode, exercises: [{ exerciseId, sets: [set, set] }] },
        ],
      },
      cookie,
    )
    .set('If-Match', String(program.version));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String((saved.body as Program).version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
}

let plan: Plan;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  for (const group of GROUPS) {
    const created = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (perfiles)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 150, PROCNT: 10, FAT: 5, CHOCDF: 15 },
      },
      cookie,
    );
    foods[group] = (created.body as { id: string }).id;
  }
  const exercise = await harness.post(
    '/exercises',
    {
      name: 'Sentadilla con barra (perfiles)',
      pattern: 'SQUAT',
      level: 'INTERMEDIATE',
      modality: 'STRENGTH',
      primaryMuscles: ['QUADRICEPS'],
    },
    cookie,
  );
  expect(exercise.status, JSON.stringify(exercise.body)).toBe(201);
  exerciseId = (exercise.body as { id: string }).id;
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-E07 · 07 §2 · los perfiles de día en el borrador', () => {
  it('el borrador los guarda y calcula sus kcal desde los gramos, con su método; Entrenamiento es la prescripción', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const draft = created.body as Plan;
    expect(draft.dayProfiles).toEqual([]);
    const reparto = (await put(draft, readyBody(draft, []))).body as Plan;

    const saved = await put(reparto, readyBody(reparto, [REST, HIGH]));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    plan = saved.body as Plan;

    expect(plan.targets.kcal).toBeCloseTo(LUIS_KCAL, 6);
    expect(plan.dayProfiles).toMatchObject([
      { code: 'REST', name: 'Descanso', kcal: REST_KCAL, choG: 120 },
      { code: 'ALTO', name: 'Alto', kcal: HIGH_KCAL, choG: 250 },
    ]);
    expect(plan.dayProfiles[0]?.method).toMatchObject({
      methodCode: 'MACROS_DAY_PROFILE',
      methodVersion: '1.0.0',
    });
  });

  it('la vista previa del editor calcula los perfiles del cuerpo, sin guardarlos', async () => {
    const preview = await harness.post(
      `/nutrition-plans/${plan.id}/preview`,
      readyBody(plan, [{ ...REST, choG: 150 }]),
      cookie,
    );
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect((preview.body as Plan).dayProfiles).toMatchObject([{ code: 'REST', choG: 150 }]);
    const read = (await harness.get(`/nutrition-plans/${plan.id}`, cookie)).body as Plan;
    expect(read.dayProfiles.map((p) => p.code)).toEqual(['REST', 'ALTO']);
  });

  it('un código repetido o Entrenamiento como perfil no se guardan: 422 con cada problema', async () => {
    const repeated = await put(plan, readyBody(plan, [REST, { ...HIGH, code: 'REST' }]));
    expect(repeated.status).toBe(422);
    expect(repeated.body).toMatchObject({
      code: 'NC-NUT-010',
      details: { problems: ['Dos perfiles no pueden tener el mismo código (REST).'] },
    });
    const training = await put(plan, readyBody(plan, [{ ...HIGH, code: 'TRAINING' }]));
    expect(training.status).toBe(422);
    const lowercase = await put(plan, readyBody(plan, [{ ...HIGH, code: 'alto' }]));
    expect(lowercase.status).toBe(400);
  });
});

describe('RN-E15 · publicar congela los perfiles de día', () => {
  it('el snapshot los trae con su método, y una versión nueva los copia', async () => {
    const published = await harness
      .post(`/nutrition-plans/${plan.id}/publish`, undefined, cookie)
      .set('If-Match', String(plan.version));
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    plan = published.body as Plan;

    const [row] = await owner<{ version: number; profiles: Profile[] }>(
      `SELECT snapshot_schema_version AS version, snapshot->'dayProfiles' AS profiles
       FROM nutrition.plan WHERE id = $1`,
      [plan.id],
    );
    expect(row?.version).toBe(4);
    expect(row?.profiles).toMatchObject([
      { code: 'REST', kcal: REST_KCAL, method: { methodCode: 'MACROS_DAY_PROFILE' } },
      { code: 'ALTO', kcal: HIGH_KCAL },
    ]);

    const revision = await harness.post(`/nutrition-plans/${plan.id}/revisions`, undefined, cookie);
    expect(revision.status, JSON.stringify(revision.body)).toBe(201);
    expect((revision.body as Plan).dayProfiles.map((p) => p.code)).toEqual(['REST', 'ALTO']);
  });
});

describe('RN-G03 · 07 §8 · P-20.4 · la meta de cada día según su perfil', () => {
  it('sin programa, hoy vale la meta de la prescripción: Entrenamiento, sin tipo de día', async () => {
    await harness.deliver('tracking.plans');

    const target = await todayTarget();
    expect(target).toMatchObject({ kind: null, code: 'TRAINING', name: 'Entrenamiento' });
    expect(target?.kcal).toBeCloseTo(1834.5, 1);
  });

  it('al publicarse un programa en el que hoy no hay sesión, la meta de hoy pasa a Descanso', async () => {
    // La sesión 1 fue ayer: hoy es el segundo día de la semana, sin sesión.
    await publishProgram(day(-1), null);

    expect(await todayTarget()).toEqual({
      kcal: REST_KCAL,
      kind: 'REST',
      code: 'REST',
      name: 'Descanso',
    });
  });

  it('el trabajo de cada hora crea la meta que falta con el perfil del día', async () => {
    await owner(
      `DELETE FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, day()],
    );
    const job = harness.app
      .get(JobRegistry)
      .all()
      .find((j) => j.queue === 'tracking.daily-targets');
    if (!job) throw new Error('Falta el trabajo tracking.daily-targets.');
    await job.run();

    expect(await todayTarget()).toMatchObject({ code: 'REST', kcal: REST_KCAL });
  });

  it('RF-32 · el resumen diario y la analítica de dieta comparan el día con la meta de su perfil', async () => {
    const job = harness.app
      .get(JobRegistry)
      .all()
      .find((j) => j.queue === 'analytics.daily-refresh');
    if (!job) throw new Error('Falta el trabajo analytics.daily-refresh.');
    await job.run();

    const diet = await harness.get(
      `/patients/${patientId}/analytics/diet?from=${day()}&to=${day()}`,
      cookie,
    );
    expect(diet.status, JSON.stringify(diet.body)).toBe(200);
    const [today] = (
      diet.body as {
        days: { localDate: string; dayKind: string; dayProfile: object; targetKcal: number }[];
      }
    ).days;
    expect(today).toMatchObject({
      localDate: day(),
      dayKind: 'REST',
      dayProfile: { code: 'REST', name: 'Descanso' },
      targetKcal: REST_KCAL,
    });
  });

  it('una sesión de hoy con su perfil propio lleva ese perfil; una sin perfil, Entrenamiento', async () => {
    await publishProgram(day(), 'ALTO');
    expect(await todayTarget()).toEqual({
      kcal: HIGH_KCAL,
      kind: 'TRAINING',
      code: 'ALTO',
      name: 'Alto',
    });

    await publishProgram(day(), null);
    const target = await todayTarget();
    expect(target).toMatchObject({ kind: 'TRAINING', code: 'TRAINING', name: 'Entrenamiento' });
    expect(target?.kcal).toBeCloseTo(1834.5, 1);
  });
});

interface Portions {
  starchByMeal: number[];
  manual: boolean;
  totals: { choG: number };
  adequacy: { cho: { pct: number } };
}

interface MePlanView {
  plan: {
    profile: { code: string; name: string } | null;
    meals: {
      id: string;
      slotCode: string;
      options: { groupCode: string; servings: number; foods: { foodId: string }[] }[];
    }[];
  } | null;
}

/** El acceso a la app (RN-A06): invitación por correo, cada finalidad que falta y la sesión PATIENT. */
async function appSession(): Promise<string> {
  const email = `luis-perfiles-${id()}@demo.test`;
  const invited = await harness.post(`/patients/${patientId}/invitation`, { email }, cookie);
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(email);
  const inspected = await harness.post('/invitations/inspect', { token });
  const consents = (inspected.body as { consents: { id: string }[] }).consents.map((c) => c.id);
  const accepted: request.Response = await harness.post('/invitations/accept', {
    token,
    password: 'un-cielo-gris-sobre-lima',
    acceptedConsentDocumentIds: consents,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  const raw = accepted.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
}

describe('07 §2 · P-20.5 · los almidones de cada perfil en un plan por intercambios', () => {
  // G-18 da a Luis 6 almidones (1, 1, 2, 1 y 1 por tiempo) y 191 g de carbohidratos. Su Descanso pide 120 g: unos 5 almidones
  // menos (15 g cada uno en la DEMO).
  let exchanges: Plan & { dayProfiles: (Profile & { portions: Portions | null })[] };
  const portionsOf = (body: unknown) =>
    (body as { dayProfiles: { portions: Portions | null }[] }).dayProfiles[0]?.portions;

  it('sin reparto del coach, Descanso lleva la sugerencia del motor: primero la media tarde y la cena', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const draft = created.body as Plan;
    const saved = await put(draft, readyBody(draft, [REST]));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    exchanges = saved.body as typeof exchanges;

    expect(portionsOf(exchanges)).toMatchObject({
      starchByMeal: [1, 0, 0, 0, 0],
      manual: false,
      totals: { choG: 191 - 5 * 15 },
    });
    expect(
      (exchanges as unknown as { methods: { methodCode: string }[] }).methods.some(
        (m) => m.methodCode === 'STARCH_BY_DAY_PROFILE',
      ),
    ).toBe(true);
    const rows = await owner(
      `SELECT 1 FROM nutrition.plan_meal_profile_exchange WHERE plan_id = $1`,
      [exchanges.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('el reparto del coach se guarda y manda; publicar lo congela en el snapshot 4', async () => {
    const saved = await put(exchanges, {
      ...readyBody(exchanges, [REST]),
      starchByProfile: { REST: [1, 1, 1, 0, 0] },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    exchanges = saved.body as typeof exchanges;
    expect(portionsOf(exchanges)).toMatchObject({ starchByMeal: [1, 1, 1, 0, 0], manual: true });
    const rows = await owner<{ servings: number }>(
      `SELECT servings FROM nutrition.plan_meal_profile_exchange WHERE plan_id = $1 AND profile_code = 'REST'`,
      [exchanges.id],
    );
    expect(rows.map((r) => r.servings).sort()).toEqual([0, 0, 1, 1, 1]);

    const published = await harness
      .post(`/nutrition-plans/${exchanges.id}/publish`, undefined, cookie)
      .set('If-Match', String(exchanges.version));
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const [snapshot] = await owner<{ version: number; portions: Portions }>(
      `SELECT snapshot_schema_version AS version, snapshot->'dayProfiles'->0->'portions' AS portions
       FROM nutrition.plan WHERE id = $1`,
      [exchanges.id],
    );
    expect(snapshot).toMatchObject({ version: 4, portions: { starchByMeal: [1, 1, 1, 0, 0] } });
    await expect(
      owner(`UPDATE nutrition.plan_meal_profile_exchange SET servings = 2 WHERE plan_id = $1`, [
        exchanges.id,
      ]),
    ).rejects.toThrow(/RN-E15/);
  });

  it('un día de Descanso, la app muestra y registra sus almidones; lo que ese día no va no está en el plan (RN-G05)', async () => {
    await harness.deliver('tracking.plans');
    // La sesión 1 fue ayer: hoy no hay sesión y vale Descanso.
    await publishProgram(day(-1), null);
    expect(await todayTarget()).toMatchObject({ code: 'REST' });
    const patientCookie = await appSession();

    const view = (await harness.get('/me/plan', patientCookie)).body as MePlanView;
    expect(view.plan?.profile).toEqual({ code: 'REST', name: 'Descanso' });
    const starch = (slot: string) =>
      view.plan?.meals
        .find((meal) => meal.slotCode === slot)
        ?.options.find((option) => option.groupCode === 'STA')?.servings ?? 0;
    expect(['BREAKFAST', 'MID_MORNING', 'LUNCH', 'AFTERNOON', 'DINNER'].map(starch)).toEqual([
      1, 1, 1, 0, 0,
    ]);

    const mealId = (slot: string) => view.plan?.meals.find((m) => m.slotCode === slot)?.id ?? '';
    const log = (slot: string) =>
      harness.post(
        '/me/food-logs',
        {
          clientId: id(),
          localDate: day(),
          source: { kind: 'EXCHANGE', mealId: mealId(slot), groupCode: 'STA', foodId: foods.STA },
        },
        patientCookie,
      );
    const lunch = await log('LUNCH');
    expect(lunch.status, JSON.stringify(lunch.body)).toBe(201);
    expect((lunch.body as { records: { servings: number }[] }).records[0]?.servings).toBe(1);
    const afternoon = await log('AFTERNOON');
    expect(afternoon.status, JSON.stringify(afternoon.body)).toBe(422);
  });
});

describe('07 §2 · P-20.5 · la cantidad de cada alimento en un perfil (composición)', () => {
  it('se guarda solo lo que cambia; el perfil calcula su día y su adecuación con esas cantidades', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { modality: 'COMPOSITION', energyPrescriptionId: prescriptionId },
      cookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const draft = created.body as Plan;
    const item = (grams: number, rest: number) => ({
      itemType: 'FOOD',
      foodId: foods.STA,
      grams,
      householdText: null,
      byProfile: { REST: { grams: rest, householdText: null } },
    });
    const saved = await put(draft, {
      modality: 'COMPOSITION',
      meals: draft.meals.map(({ slotCode, name, timeOfDay, sharePct }) => ({
        slotCode,
        name,
        timeOfDay,
        sharePct,
        items: [item(200, slotCode === 'AFTERNOON' ? 100 : 200)],
      })),
      hydrationTargetMl: 2_500,
      instructions: null,
      dayProfiles: [REST],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const plan = saved.body as {
      meals: { slotCode: string; items: { byProfile: Record<string, { grams: number }> }[] }[];
      totals: { nutrients: Record<string, { value: number }> };
      dayProfiles: { portions: { totals: { nutrients: Record<string, { value: number }> } } }[];
    };

    // 200 g en cada tiempo; en la media tarde de Descanso, 100. A 150 kcal por 100 g: 1,500 y 1,350 kcal.
    expect(plan.meals.find((m) => m.slotCode === 'AFTERNOON')?.items[0]?.byProfile).toEqual({
      REST: { grams: 100, householdText: null },
    });
    expect(plan.meals.find((m) => m.slotCode === 'LUNCH')?.items[0]?.byProfile).toEqual({});
    expect(plan.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(1500, 6);
    expect(plan.dayProfiles[0]?.portions.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(1350, 6);
    const rows = await owner(`SELECT 1 FROM nutrition.plan_item_profile WHERE plan_id = $1`, [
      (saved.body as Plan).id,
    ]);
    expect(rows).toHaveLength(1);
  });
});
