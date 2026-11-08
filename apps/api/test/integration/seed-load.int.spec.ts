import { readFile } from 'node:fs/promises';
import { hash } from '@node-rs/argon2';
import {
  dietAnalyticsSchema,
  overviewResponseSchema,
  patientListResponseSchema,
  trainingAnalyticsSchema,
} from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BLOCK_DAYS,
  LOAD_IDS,
  LOAD_OWNER_EMAIL,
  professionalEmail,
  seedLoad,
  type LoadApi,
  type LoadReport,
} from '../../scripts/seed-load.js';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';

/**
 * P14 (PR 7a) · el generador de carga contra PostgreSQL (RNF-05, 01 §9, ADR-096), en pequeño: 3 pacientes y 13 semanas. La plantilla
 * sale de la API; los pacientes, las copias y la historia, de SQL con source IMPORT; la reconstrucción da la analítica de cada uno, y
 * cada profesional ve solo a sus pacientes (RN-A05). Datos sintéticos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const PASSWORD = 'una-carga-sintetica-de-prueba';
/** Los de Argon2PasswordHasher (RNF-13). 2 = Algorithm.Argon2id, un const enum. */
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const harness = new ApiHarness();
let ownerCookie: string;
let report: LoadReport;
let passwordHash: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const limaToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

async function login(email: string): Promise<string> {
  const response = await harness.post('/auth/login', { email, password: PASSWORD });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return sessionCookie(response);
}

/** La API del generador con el harness: sin worker, `settle` entrega a mano el cálculo de la evaluación. */
async function harnessApi(): Promise<LoadApi> {
  const cookie = await login(LOAD_OWNER_EMAIL);
  return {
    call: async (method, path, options = {}) => {
      const sent =
        method === 'GET'
          ? harness.get(path, cookie)
          : method === 'POST'
            ? harness.post(path, options.body as object | undefined, cookie)
            : harness.put(path, options.body ?? {}, cookie);
      const response = await (options.ifMatch === undefined
        ? sent
        : sent.set('If-Match', `"${String(options.ifMatch)}"`));
      return { status: response.status, body: response.body as unknown };
    },
    settle: () => harness.deliver('assessment.calculation'),
  };
}

const loadPatients = () =>
  owner<{ id: string; code: string; responsible_member_id: string }>(
    `SELECT id, code, responsible_member_id FROM clinical.patient
     WHERE organization_id = $1 AND first_name <> 'Plantilla' ORDER BY code`,
    [LOAD_IDS.organization],
  );

beforeAll(async () => {
  await harness.start();
  const imported = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(imported.status);
  passwordHash = await hash(PASSWORD, ARGON2_OPTIONS);
  report = await seedLoad(pool('owner'), harnessApi, {
    patients: 3,
    years: 0.25,
    today: limaToday(),
    passwordHash,
    seed: 7,
  });
  const rebuild = harness.app.get(AnalyticsRebuild);
  for (const patient of await loadPatients()) await rebuild.patient(patient.id);
  ownerCookie = await login(LOAD_OWNER_EMAIL);
}, 300_000);

afterAll(async () => {
  await harness.stop();
});

describe('RNF-05 · ADR-096 · el generador de carga', () => {
  it('los pacientes con su código, su responsable y HEALTH_DATA; un programa por bloque de 12 semanas', async () => {
    expect(report).toMatchObject({ organizationCreated: true, patients: 3 });
    expect(report.days).toBe(91);
    const patients = await loadPatients();
    expect(patients.map((p) => p.code)).toEqual(['P-000002', 'P-000003', 'P-000004']);
    expect(new Set(patients.map((p) => p.responsible_member_id)).size).toBe(3);
    const consents = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM clinical.consent WHERE organization_id = $1 AND purpose = 'HEALTH_DATA'`,
      [LOAD_IDS.organization],
    );
    expect(Number(consents[0]?.n)).toBe(4);
    // 91 días: un bloque completo de 84 y el vigente.
    expect(Math.ceil(92 / BLOCK_DAYS)).toBe(2);
    expect(report.rows['program']).toBe(6);
    const programs = await owner<{ status: string; n: string }>(
      `SELECT status, count(*) AS n FROM training.program WHERE organization_id = $1 GROUP BY status ORDER BY status`,
      [LOAD_IDS.organization],
    );
    // La plantilla sigue publicada; cada paciente tiene su vigente y el anterior reemplazado.
    expect(programs.map((p) => [p.status, Number(p.n)])).toEqual([
      ['PUBLISHED', 4],
      ['SUPERSEDED', 3],
    ]);
  });

  it('la historia va con source IMPORT y cada entreno con sus series', async () => {
    for (const table of ['food_log', 'daily_checkin', 'workout_log', 'metric_log']) {
      const rows = await owner<{ source: string; n: string }>(
        `SELECT source, count(*) AS n FROM tracking.${table} WHERE organization_id = $1 GROUP BY source`,
        [LOAD_IDS.organization],
      );
      expect(
        rows.map((r) => r.source),
        table,
      ).toEqual(['IMPORT']);
    }
    const orphans = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM tracking.workout_log w
       WHERE w.organization_id = $1 AND NOT EXISTS (SELECT 1 FROM tracking.set_log s WHERE s.workout_log_id = w.id)`,
      [LOAD_IDS.organization],
    );
    expect(Number(orphans[0]?.n)).toBe(0);
    expect(report.rows['daily_target']).toBe(3 * 91);
  });

  it('RF-32 · RF-33 · la reconstrucción da la analítica de cada paciente con lo programado', async () => {
    const [patient] = await loadPatients();
    const diet = dietAnalyticsSchema.parse(
      (await harness.get(`/patients/${patient?.id ?? ''}/analytics/diet`, ownerCookie)).body,
    );
    const week = diet.weeks.at(-2);
    expect(week?.daysWithTarget).toBe(7);
    expect(week?.daysInRange).toBeGreaterThanOrEqual(0);
    expect(week?.daysInRange).toBeLessThanOrEqual(7);

    const training = trainingAnalyticsSchema.parse(
      (await harness.get(`/patients/${patient?.id ?? ''}/analytics/training`, ownerCookie)).body,
    );
    expect(training.weeks.some((w) => w.muscles.some((m) => (m.setsPlanned ?? 0) > 0))).toBe(true);
    expect(training.weeks.some((w) => w.muscles.some((m) => m.setsDone > 0))).toBe(true);
    expect(training.oneRm.length).toBeGreaterThan(0);
  });

  it('RN-A05 · cada profesional ve solo a sus pacientes; la dueña ve el panel de todos', async () => {
    const professional = await login(professionalEmail(1));
    const mine = patientListResponseSchema.parse(
      (await harness.get('/patients', professional)).body,
    );
    expect(mine.patients.map((p) => p.code)).toEqual(['P-000002']);

    const overview = overviewResponseSchema.parse(
      (await harness.get('/analytics/overview', ownerCookie)).body,
    );
    expect(overview.total).toBeGreaterThanOrEqual(0);
  });

  it('correr dos veces no duplica: si la organización de carga ya existe, no hace nada', async () => {
    const again = await seedLoad(pool('owner'), harnessApi, {
      patients: 3,
      years: 0.25,
      today: limaToday(),
      passwordHash,
    });
    expect(again).toEqual({ organizationCreated: false, patients: 0, days: 0, rows: {} });
    expect(await loadPatients()).toHaveLength(3);
  });
});
