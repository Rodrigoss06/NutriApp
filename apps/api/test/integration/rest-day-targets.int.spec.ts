import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobRegistry } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P14.5 (PR 1a) · metas de día de entrenamiento y de descanso por HTTP contra PostgreSQL como app_user (07 §2, P-20;
 * RN-E07, RN-G03, RN-E15; ADR-099). La meta de la prescripción es la del día de entrenamiento; el profesional escribe las
 * kcal del día de descanso y la proteína y la grasa no cambian. La meta de cada día sale del tipo del día en el programa
 * vigente (07 §8); sin programa, la de la prescripción.
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
/** G-17: las metas exactas de Luis (≈ 1834.54 kcal, 160 g de proteína y 25 % de grasa, ≈ 50.96 g). */
const LUIS_KCAL = 1834.5357142857142;
const LUIS_FAT_G = 50.95932539682539;
/** Su día de descanso: 300 kcal menos, con la misma proteína y la misma grasa. */
const REST_KCAL = 1535;
const REST_CHO_G = (REST_KCAL - 160 * 4 - LUIS_FAT_G * 9) / 4;

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
let exerciseId: string;
const foods: Record<string, string> = {};

interface Macros {
  kcal: number;
  choG: number;
  proteinG: number;
  fatG: number;
}

interface Plan {
  id: string;
  status: string;
  version: number;
  meals: {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Record<string, number>;
  }[];
  targets: Macros;
  restDayKcal: number | null;
  restDayTargets: (Macros & { method: { methodCode: string; methodVersion: string } }) | null;
}

interface Program {
  id: string;
  version: number;
  document: { mesocycles: { weeks: { id: string }[] }[] };
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
const readyBody = (plan: Plan, restDayKcal: number | null) => ({
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
  restDayKcal,
});

const put = (plan: Plan, body: object) =>
  harness.put(`/nutrition-plans/${plan.id}`, body, cookie).set('If-Match', String(plan.version));

/** La meta guardada de hoy: la de alimentación y el tipo del día. */
async function todayTarget(): Promise<{ kcal: number; cho: number; kind: string | null }[]> {
  return owner(
    `SELECT kcal::float8 AS kcal, cho_g::float8 AS cho, day_kind AS kind
     FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
    [patientId, day()],
  );
}

/** Un programa a mano de una semana con una sola sesión, que va el primer día (07 §8). */
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
      { sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId, sets: [set, set] }] }] },
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
        name: `Alimento ${group} (descanso)`,
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
      name: 'Sentadilla con barra (descanso)',
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

describe('RN-E07 · 07 §2 · las kcal del día de descanso en el borrador', () => {
  it('el borrador las guarda y calcula sus metas con su método: la proteína y la grasa no cambian', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const draft = created.body as Plan;
    expect(draft).toMatchObject({ restDayKcal: null, restDayTargets: null });
    const reparto = (await put(draft, readyBody(draft, null))).body as Plan;

    const saved = await put(reparto, readyBody(reparto, REST_KCAL));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    plan = saved.body as Plan;

    expect(plan.targets.kcal).toBeCloseTo(LUIS_KCAL, 6);
    expect(plan.restDayKcal).toBe(REST_KCAL);
    expect(plan.restDayTargets).toMatchObject({
      kcal: REST_KCAL,
      proteinG: 160,
      method: { methodCode: 'MACROS_REST_DAY', methodVersion: '1.0.0' },
    });
    expect(plan.restDayTargets?.fatG).toBeCloseTo(LUIS_FAT_G, 6);
    expect(plan.restDayTargets?.choG).toBeCloseTo(REST_CHO_G, 6);
  });

  it('la vista previa del editor trae las metas de descanso del cuerpo, sin guardarlas', async () => {
    const preview = await harness.post(
      `/nutrition-plans/${plan.id}/preview`,
      readyBody(plan, 1700),
      cookie,
    );
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect((preview.body as Plan).restDayTargets?.kcal).toBe(1700);
    expect((await harness.get(`/nutrition-plans/${plan.id}`, cookie)).body).toMatchObject({
      restDayKcal: REST_KCAL,
    });
  });

  it('con carbohidratos negativos el borrador no se guarda: 422 con la regla', async () => {
    const rejected = await put(plan, readyBody(plan, 900));
    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ code: 'NC-NUT-018', rule: 'RN-E07' });
  });
});

describe('RN-E15 · publicar congela las metas de descanso', () => {
  it('el snapshot de la versión 2 las trae con su método, y una versión nueva las copia', async () => {
    const published = await harness
      .post(`/nutrition-plans/${plan.id}/publish`, undefined, cookie)
      .set('If-Match', String(plan.version));
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    plan = published.body as Plan;

    const [row] = await owner<{ version: number; rest: Macros & { method: object } }>(
      `SELECT snapshot_schema_version AS version, snapshot->'restDayTargets' AS rest
       FROM nutrition.plan WHERE id = $1`,
      [plan.id],
    );
    expect(row?.version).toBe(2);
    expect(row?.rest).toMatchObject({
      kcal: REST_KCAL,
      method: { methodCode: 'MACROS_REST_DAY' },
    });

    const revision = await harness.post(`/nutrition-plans/${plan.id}/revisions`, undefined, cookie);
    expect(revision.status, JSON.stringify(revision.body)).toBe(201);
    expect(revision.body).toMatchObject({ restDayKcal: REST_KCAL });
  });
});

describe('RN-G03 · 07 §8 · la meta de cada día según su tipo', () => {
  it('sin programa, hoy vale la meta de la prescripción y el día no tiene tipo', async () => {
    await harness.deliver('tracking.plans');

    const [target] = await todayTarget();
    expect(target?.kcal).toBeCloseTo(1834.5, 1);
    expect(target?.kind).toBeNull();
  });

  it('al publicarse un programa en el que hoy es descanso, la meta de hoy pasa a la de descanso', async () => {
    // La sesión 1 fue ayer: hoy es el segundo día de la semana, sin sesión.
    await publishProgram(day(-1));

    const [target] = await todayTarget();
    expect(target?.kind).toBe('REST');
    expect(target?.kcal).toBe(REST_KCAL);
    expect(target?.cho).toBeCloseTo(REST_CHO_G, 1);
  });

  it('el trabajo de cada hora crea la meta que falta con el tipo del día', async () => {
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

    const [target] = await todayTarget();
    expect(target).toMatchObject({ kind: 'REST', kcal: REST_KCAL });
  });

  it('RF-32 · el resumen diario y la analítica de dieta comparan el día con la meta de su tipo', async () => {
    await harness.deliver('analytics.daily-summary');
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
      diet.body as { days: { localDate: string; dayKind: string; targetKcal: number }[] }
    ).days;
    expect(today).toMatchObject({ localDate: day(), dayKind: 'REST', targetKcal: REST_KCAL });
  });

  it('con un programa en el que hoy hay sesión, la meta de hoy es la de la prescripción', async () => {
    await publishProgram(day());

    const [target] = await todayTarget();
    expect(target?.kind).toBe('TRAINING');
    expect(target?.kcal).toBeCloseTo(1834.5, 1);
  });
});
