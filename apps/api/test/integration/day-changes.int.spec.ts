import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobRegistry } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P14.5 (PR 1e) · los cambios del día por HTTP contra PostgreSQL como app_user (07 §2 y §8; P-20.3 y P-20.4; RN-G03; ADR-104):
 * «no entreno hoy», «mover a mañana» y «sí entreno hoy», del paciente o del coach, y el perfil que el coach elige para hoy o
 * mañana. Nada se aplica solo: la meta de hoy se vuelve a fijar al recibir tracking.day.rescheduled.
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
const REST = { code: 'REST', name: 'Descanso', choG: 120, proteinG: 160, fatG: 51 };
const HIGH = { code: 'ALTO', name: 'Alto', choG: 250, proteinG: 160, fatG: 51 };
/** Atwater con los gramos: mandan los gramos (P-20.2). */
const REST_KCAL = 120 * 4 + 160 * 4 + 51 * 9;
const HIGH_KCAL = 250 * 4 + 160 * 4 + 51 * 9;

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientCookie: string;
let patientId: string;
let prescriptionId: string;
let exerciseId: string;
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

interface Program {
  id: string;
  version: number;
  document: { mesocycles: { weeks: { id: string }[] }[] };
}

interface ScheduleDay {
  localDate: string;
  profile: { code: string; name: string } | null;
  kcal: number | null;
  sessions: number | null;
  change: string | null;
}

interface Schedule {
  today: ScheduleDay;
  tomorrow: ScheduleDay;
  options: { notTraining: boolean; moveToTomorrow: boolean; undo: string | null };
  choices?: { code: string; name: string }[];
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

/** La meta guardada de hoy: la de alimentación, el tipo del día, sus sesiones y el perfil con que se fijó. */
async function todayTarget() {
  const [row] = await owner<{
    kcal: number;
    kind: string | null;
    sessions: number | null;
    code: string | null;
  }>(
    `SELECT kcal::float8 AS kcal, day_kind AS kind, planned_sessions AS sessions, day_profile_code AS code
     FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
    [patientId, day()],
  );
  return row;
}

/** G-18 con un alimento permitido de cada grupo en cada tiempo donde tiene intercambios (RN-G05). */
const readyBody = (plan: Plan) => ({
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
  dayProfiles: [REST, HIGH],
});

/** Un programa de una semana con una sola sesión, que va el primer día (07 §8), sin perfil: Entrenamiento. */
async function publishProgram(startDate: string): Promise<void> {
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
          { name: 'Sesión 1', dayProfileCode: null, exercises: [{ exerciseId, sets: [set] }] },
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

/** El acceso a la app (RN-A06): invitación por correo, cada finalidad que falta y la sesión PATIENT. */
async function appSession(): Promise<string> {
  const email = `luis-agenda-${id()}@demo.test`;
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

const changeToday = async (action: string, as: 'PATIENT' | 'STAFF' = 'PATIENT') => {
  const response =
    as === 'PATIENT'
      ? await harness.post('/me/schedule/today', { action }, patientCookie)
      : await harness.post(`/patients/${patientId}/schedule/today`, { action }, cookie);
  return { status: response.status, body: response.body as Schedule & { code?: string } };
};

const setProfile = async (localDate: string, profileCode: string | null) => {
  const response = await harness.put(
    `/patients/${patientId}/schedule/${localDate}/profile`,
    { profileCode },
    cookie,
  );
  return { status: response.status, body: response.body as Schedule & { code?: string } };
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  for (const group of GROUPS) {
    const created = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (agenda)`,
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
      name: 'Sentadilla con barra (agenda)',
      pattern: 'SQUAT',
      level: 'INTERMEDIATE',
      modality: 'STRENGTH',
      primaryMuscles: ['QUADRICEPS'],
    },
    cookie,
  );
  expect(exercise.status, JSON.stringify(exercise.body)).toBe(201);
  exerciseId = (exercise.body as { id: string }).id;

  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const draft = created.body as Plan;
  // El primer guardado fija los grupos y reparte los intercambios; el segundo pone un alimento permitido en cada tiempo que los
  // tiene (RN-G05).
  const first = await harness
    .put(`/nutrition-plans/${draft.id}`, readyBody(draft), cookie)
    .set('If-Match', String(draft.version));
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  const split = first.body as Plan;
  const saved = await harness
    .put(`/nutrition-plans/${draft.id}`, readyBody(split), cookie)
    .set('If-Match', String(split.version));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await harness
    .post(`/nutrition-plans/${draft.id}/publish`, undefined, cookie)
    .set('If-Match', String((saved.body as Plan).version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.plans');
  // Hoy es el primer día: lleva la sesión. Mañana es de descanso.
  await publishProgram(day());
  patientCookie = await appSession();
});

afterAll(async () => {
  await harness.stop();
});

describe('P-20.3 · sin cambios manda el programa', () => {
  it('Hoy dice el perfil de hoy y de mañana, y ofrece «no entreno hoy» y «mover a mañana»', async () => {
    const today = await harness.get('/me/today', patientCookie);
    expect(today.status, JSON.stringify(today.body)).toBe(200);
    const { schedule } = today.body as { schedule: Schedule };
    expect(schedule).toEqual({
      today: {
        localDate: day(),
        profile: { code: 'TRAINING', name: 'Entrenamiento' },
        kcal: expect.any(Number) as number,
        sessions: 1,
        change: null,
      },
      tomorrow: {
        localDate: day(1),
        profile: { code: 'REST', name: 'Descanso' },
        kcal: REST_KCAL,
        sessions: 0,
        change: null,
      },
      options: { notTraining: true, moveToTomorrow: true, undo: null },
    });
    expect(await todayTarget()).toMatchObject({ code: 'TRAINING', kind: 'TRAINING', sessions: 1 });
  });
});

describe('P-20.3 · «mover a mañana» y «sí entreno hoy»', () => {
  it('hoy pasa a Descanso y la sesión, con su perfil, a mañana; la meta de hoy se vuelve a fijar', async () => {
    const moved = await changeToday('MOVE_TO_TOMORROW');
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.today).toMatchObject({
      profile: { code: 'REST' },
      kcal: REST_KCAL,
      sessions: 0,
      change: 'MOVED',
    });
    expect(moved.body.tomorrow).toMatchObject({
      profile: { code: 'TRAINING' },
      sessions: 1,
      change: 'MOVED',
    });
    expect(moved.body.options).toEqual({
      notTraining: false,
      moveToTomorrow: false,
      undo: 'MOVED',
    });

    await harness.deliver('tracking.day-changes');
    expect(await todayTarget()).toEqual({
      kcal: REST_KCAL,
      kind: 'REST',
      sessions: 0,
      code: 'REST',
    });
    const training = await harness.get('/me/training', patientCookie);
    expect((training.body as { sessions: unknown[] }).sessions).toEqual([]);

    // La analítica recalcula el día con la meta nueva (tracking.target.changed).
    await harness.deliver('analytics.daily-summary');
    const [summary] = await owner<{ code: string | null }>(
      `SELECT day_profile_code AS code FROM analytics.patient_daily_summary
       WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, day()],
    );
    expect(summary?.code).toBe('REST');
  });

  it('no se mueve dos veces ni se deja un día que ya cambió', async () => {
    expect(await changeToday('MOVE_TO_TOMORROW')).toMatchObject({
      status: 422,
      body: { code: 'NC-TRK-015' },
    });
    expect(await changeToday('NOT_TRAINING')).toMatchObject({
      status: 422,
      body: { code: 'NC-TRK-014' },
    });
  });

  it('«sí entreno hoy» devuelve la sesión a hoy y anula el cambio sin borrarlo', async () => {
    const undone = await changeToday('UNDO');
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    expect(undone.body.today).toMatchObject({
      profile: { code: 'TRAINING' },
      sessions: 1,
      change: null,
    });
    expect(undone.body.tomorrow).toMatchObject({ profile: { code: 'REST' }, sessions: 0 });

    await harness.deliver('tracking.day-changes');
    expect(await todayTarget()).toMatchObject({ code: 'TRAINING', kind: 'TRAINING', sessions: 1 });
    const rows = await owner<{ kind: string; voided: boolean; role: string }>(
      `SELECT kind, voided_at IS NOT NULL AS voided, created_by_role AS role FROM tracking.day_change
       WHERE patient_id = $1`,
      [patientId],
    );
    expect(rows).toEqual([{ kind: 'MOVED', voided: true, role: 'PATIENT' }]);
    expect(await changeToday('UNDO')).toMatchObject({ status: 422, body: { code: 'NC-TRK-016' } });
  });
});

describe('P-20.3 · «no entreno hoy»', () => {
  it('baja la meta de hoy a Descanso; la sesión sigue planificada y no hecha (P-33)', async () => {
    const skipped = await changeToday('NOT_TRAINING');
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200);
    expect(skipped.body.today).toMatchObject({
      profile: { code: 'REST' },
      sessions: 1,
      change: 'NOT_TRAINING',
    });
    await harness.deliver('tracking.day-changes');
    expect(await todayTarget()).toEqual({
      kcal: REST_KCAL,
      kind: 'TRAINING',
      sessions: 1,
      code: 'REST',
    });

    expect((await changeToday('UNDO')).status).toBe(200);
    await harness.deliver('tracking.day-changes');
    expect(await todayTarget()).toMatchObject({ code: 'TRAINING' });
  });
});

describe('P-20.4 · el coach, solo hoy y mañana', () => {
  it('ve la agenda con los perfiles que puede poner, y el paciente no entra a esa ruta', async () => {
    const schedule = await harness.get(`/patients/${patientId}/schedule`, cookie);
    expect(schedule.status, JSON.stringify(schedule.body)).toBe(200);
    expect((schedule.body as Schedule).choices?.map((choice) => choice.code)).toEqual([
      'TRAINING',
      'REST',
      'ALTO',
    ]);
    expect((await harness.get(`/patients/${patientId}/schedule`, patientCookie)).status).toBe(403);
  });

  it('elige el perfil de mañana; null vuelve al programa', async () => {
    const high = await setProfile(day(1), 'ALTO');
    expect(high.status, JSON.stringify(high.body)).toBe(200);
    expect(high.body.tomorrow).toEqual({
      localDate: day(1),
      profile: { code: 'ALTO', name: 'Alto' },
      kcal: HIGH_KCAL,
      sessions: 0,
      change: 'PROFILE',
    });
    const back = await setProfile(day(1), null);
    expect(back.body.tomorrow).toMatchObject({ profile: { code: 'REST' }, change: null });
  });

  it('pasado mañana, ayer o un perfil que el plan no tiene: 422 con su código', async () => {
    expect(await setProfile(day(2), 'ALTO')).toMatchObject({
      status: 422,
      body: { code: 'NC-TRK-017' },
    });
    expect(await setProfile(day(-1), 'ALTO')).toMatchObject({
      status: 422,
      body: { code: 'NC-TRK-017' },
    });
    expect(await setProfile(day(), 'REFEED')).toMatchObject({
      status: 422,
      body: { code: 'NC-TRK-018' },
    });
  });

  it('también dice «no entreno hoy» por el paciente y lo deshace', async () => {
    const skipped = await changeToday('NOT_TRAINING', 'STAFF');
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200);
    expect(skipped.body.today).toMatchObject({ profile: { code: 'REST' }, change: 'NOT_TRAINING' });
    expect((await changeToday('UNDO', 'STAFF')).status).toBe(200);
  });

  it('el trabajo de cada hora fija la meta que falta con el perfil que eligió el coach', async () => {
    expect((await setProfile(day(), 'ALTO')).status).toBe(200);
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
    expect(await todayTarget()).toEqual({
      kcal: HIGH_KCAL,
      kind: 'TRAINING',
      sessions: 1,
      code: 'ALTO',
    });
  });
});
