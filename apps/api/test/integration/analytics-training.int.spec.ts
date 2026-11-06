import { readFile } from 'node:fs/promises';
import { trainingAnalyticsSchema, type TrainingAnalytics } from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 2b) · la analítica de rutina, contra PostgreSQL como app_user (RF-33): la semana del macrociclo con sus series
 * fraccionadas contra lo programado (RN-F06, RN-F09), el tonelaje repartido como las series (ADR-088), la carga sRPE y el 1RM con la
 * fórmula del programa (RN-F04). Un ajuste de una serie cambia la semana (RN-G02) y reconstruir da lo mismo. Datos sintéticos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const PASSWORD = 'un-cielo-gris-sobre-lima';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let otherPatientId: string;
let patientCookie: string;
let programId: string;

interface Program {
  id: string;
  version: number;
  document: { mesocycles: { weeks: { id: string }[] }[] };
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

const analytics = async (query = '', as = cookie): Promise<TrainingAnalytics> => {
  const response = await harness.get(`/patients/${patientId}/analytics/training${query}`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return trainingAnalyticsSchema.parse(response.body);
};

const deliverAll = async () => {
  await harness.deliver('analytics.training-weeks');
  await harness.deliver('analytics.daily-summary');
};

/** Las filas guardadas de la analítica de rutina: lo que debe repetir una reconstrucción. */
const trainingRows = async () => ({
  weeks: await owner(
    `SELECT to_jsonb(v) AS row FROM analytics.patient_weekly_muscle_volume v
     WHERE patient_id = $1 ORDER BY week_start, muscle_code`,
    [patientId],
  ),
  oneRm: await owner(
    `SELECT to_jsonb(o) AS row FROM analytics.exercise_one_rm_series o
     WHERE patient_id = $1 ORDER BY exercise_id, local_date`,
    [patientId],
  ),
  days: await owner(
    `SELECT to_jsonb(s) - 'updated_at' AS row FROM analytics.patient_daily_summary s
     WHERE patient_id = $1 ORDER BY local_date`,
    [patientId],
  ),
});

/** Una semana que empieza hoy, con la sentadilla goblet (principal cuádriceps, secundario glúteo) de 2 × 8 con 60 kg. */
async function publishedProgram(squatId: string): Promise<string> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Fuerza base', startDate: today() },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const draft = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${draft.id}/mesocycles`, { name: 'Base', weeks: 1 }, cookie)
    .set('If-Match', String(draft.version));
  let program = added.body as Program;
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  const weekId = program.document.mesocycles[0]?.weeks[0]?.id ?? '';
  const saved = await harness
    .put(
      `/training-programs/${program.id}/weeks/${weekId}`,
      { sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: squatId, sets: [set, set] }] }] },
      cookie,
    )
    .set('If-Match', String(program.version));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  program = saved.body as Program;
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
  return program.id;
}

async function appSession(): Promise<string> {
  const email = `ines-${uuid()}@demo.test`;
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

const me = (path: string, body: object) =>
  harness.post(path, { clientId: uuid(), localDate: today(), ...body }, patientCookie);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  const [squat] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = 'SQ01'`,
  );
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  otherPatientId = await patientWithConsent(harness, org, {
    firstName: 'Ana',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1990-02-11',
  });
  programId = await publishedProgram(squat?.id ?? '');
  patientCookie = await appSession();
  const training = (await harness.get('/me/training', patientCookie)).body as {
    sessions: { id: string; exercises: { exerciseId: string }[] }[];
  };
  const session = training.sessions[0];
  const exerciseId = session?.exercises[0]?.exerciseId;
  const workout = await me('/me/workouts', {
    sessionId: session?.id,
    outcome: 'COMPLETED',
    durationMinutes: 40,
    sessionRpe: 7,
    sets: [
      { exerciseId, setNo: 1, reps: 8, loadKg: 60 },
      { exerciseId, setNo: 2, reps: 8, loadKg: 60 },
    ],
  });
  expect(workout.status, JSON.stringify(workout.body)).toBe(201);
  const checkin = await me('/me/checkins', {
    sessionMinutes: 40,
    sessionRpe: 7,
    sleepHours: 7,
    fatigue: 2,
  });
  expect(checkin.status, JSON.stringify(checkin.body)).toBe(201);
  await deliverAll();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-33 · la semana del macrociclo contra lo programado', () => {
  it('series fraccionadas por grupo (RN-F06), cumplimiento (RN-F09), tonelaje y carga sRPE, con el método', async () => {
    const result = await analytics();
    const [week] = result.weeks;

    expect(result.program).toMatchObject({
      programId,
      totalWeeks: 1,
      oneRmFormula: 'ONERM_EPLEY1985',
    });
    expect(result.mesocycles).toEqual([expect.objectContaining({ name: 'Base' })]);
    expect(week).toMatchObject({
      weekNo: 1,
      weekStart: today(),
      started: true,
      isDeload: false,
      sessionsPlanned: 1,
      sessionsDone: 1,
      sessionsCompliancePct: 100,
      tonnageKg: 960,
      srpeLoad: 280,
    });
    expect(week?.muscles).toEqual([
      expect.objectContaining({
        muscleCode: 'GLUTES',
        setsPlanned: 1,
        setsDone: 1,
        compliancePct: 100,
        tonnageKg: 480,
      }),
      expect.objectContaining({
        muscleCode: 'QUADRICEPS',
        setsPlanned: 2,
        setsDone: 2,
        compliancePct: 100,
        tonnageKg: 960,
      }),
    ]);
    expect(result.methods.fractionalSets.code).toBe('FRACTIONAL_SETS');
    expect(result.methods.srpe.code).toBe('READINESS_JV');
  });

  it('RN-F04 · el 1RM del día con la fórmula del programa: 60 kg × 8 con Epley, 76 kg', async () => {
    const [series] = (await analytics()).oneRm;

    expect(series).toMatchObject({
      exerciseName: 'Sentadilla goblet',
      formula: 'ONERM_EPLEY1985',
      method: { code: 'ONERM_EPLEY1985', version: '1.0.0' },
    });
    expect(series?.points).toEqual([{ localDate: today(), estimated1rmKg: 76 }]);
  });
});

describe('RN-G02 · un ajuste de una serie cambia la semana y el 1RM', () => {
  it('la serie corregida a 10 repeticiones suma su tonelaje nuevo y estima 80 kg', async () => {
    const day = (await harness.get(`/patients/${patientId}/records/${today()}`, cookie)).body as {
      workouts: { sets: { id: string }[] }[];
    };
    const adjusted = await harness.post(
      `/patients/${patientId}/record-adjustments`,
      {
        targetType: 'SET',
        targetId: day.workouts[0]?.sets[0]?.id,
        targetLocalDate: today(),
        action: 'CORRECT',
        correctedValues: { reps: 10 },
        reason: 'Hizo diez repeticiones, no ocho.',
      },
      cookie,
    );
    expect(adjusted.status, JSON.stringify(adjusted.body)).toBe(201);
    await deliverAll();

    const result = await analytics();
    const quads = result.weeks[0]?.muscles.find((m) => m.muscleCode === 'QUADRICEPS');
    expect(quads?.tonnageKg).toBe(1080);
    expect(result.weeks[0]?.tonnageKg).toBe(1080);
    expect(result.oneRm[0]?.points[0]?.estimated1rmKg).toBe(80);
  });
});

describe('Criterio 3 de P14 · reconstruir la analítica de rutina da lo mismo', () => {
  it('las semanas, el 1RM y los días coinciden fila por fila', async () => {
    const built = await trainingRows();
    expect(built.weeks.length).toBe(2);
    expect(built.oneRm.length).toBe(1);

    await harness.app.get(AnalyticsRebuild).patient(patientId);

    expect(await trainingRows()).toEqual(built);
  });
});

describe('RN-A05 · RN-B03 · quién ve la analítica de rutina', () => {
  it('fuera del equipo, 404; un programa de otro paciente, 404; un id inválido, 400; la lectura se audita', async () => {
    const outside = await harness.get(
      `/patients/${patientId}/analytics/training`,
      org.staff.outsider.cookie,
    );
    expect(outside.status).toBe(404);

    const foreign = await harness.get(
      `/patients/${otherPatientId}/analytics/training?programId=${programId}`,
      cookie,
    );
    expect([foreign.status, (foreign.body as { code: string }).code]).toEqual([404, 'NC-ANA-002']);
    const invalid = await harness.get(
      `/patients/${patientId}/analytics/training?programId=abc`,
      cookie,
    );
    expect(invalid.status).toBe(400);

    const [read] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'analytics.patient_weekly_muscle_volume' AND patient_id = $1`,
      [patientId],
    );
    expect(read?.n).toBeGreaterThan(0);
  });

  it('sin programa vigente, sin programa y sin semanas', async () => {
    const response = await harness.get(`/patients/${otherPatientId}/analytics/training`, cookie);
    const result = trainingAnalyticsSchema.parse(response.body);

    expect(result.program).toBeNull();
    expect(result.weeks).toEqual([]);
  });
});
