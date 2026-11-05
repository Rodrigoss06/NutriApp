import { readFile } from 'node:fs/promises';
import { appNotesResponseSchema, patientDaySchema, type PatientDay } from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P13 (PR 5) · el equipo de atención y los registros del paciente, contra PostgreSQL como app_user: los ve en solo lectura
 * (RN-G01), los ajusta con motivo sin tocar el original (RN-G02) y abre sus notas, que dejan de estar sin leer (RN-G13). Todo
 * queda en la auditoría (RN-B03). El paciente no ve los ajustes (ADR-085). Datos sintéticos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const PASSWORD = 'un-cielo-gris-sobre-lima';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let foodId: string;

interface Program {
  id: string;
  version: number;
  document: {
    mesocycles: { weeks: { id: string; sessions: { id: string; position: number }[] }[] }[];
  };
}
interface Problem {
  code: string;
  rule?: string;
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** Hoy en la zona horaria del paciente (RN-G04). */
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

const readDay = async (as = cookie): Promise<PatientDay> => {
  const response = await harness.get(`/patients/${patientId}/records/${today()}`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return patientDaySchema.parse(response.body);
};

const adjust = (body: object, as = cookie) =>
  harness.post(
    `/patients/${patientId}/record-adjustments`,
    { targetLocalDate: today(), reason: 'Lo registró dos veces por error.', ...body },
    as,
  );

/** Una semana que empieza hoy, con una sesión de sentadilla goblet de 3 × 8 con 60 kg. */
async function publishedProgram(squatId: string): Promise<void> {
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
  const importer = harness.app.get(CatalogImporter);
  const report = await importer.run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n'),
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
  await publishedProgram(squat?.id ?? '');
  const food = await harness.post(
    '/foods',
    {
      name: 'Avena de prueba',
      state: 'READY',
      nutrients: { ENERC_KCAL: 380, PROCNT: 13, FAT: 7, CHOCDF: 60 },
    },
    cookie,
  );
  foodId = (food.body as { id: string }).id;
  patientCookie = await appSession();

  // Lo que registra la paciente hoy, por su app.
  expect(
    (
      await me('/me/food-logs', {
        source: { kind: 'CATALOG', mealSlotCode: 'BREAKFAST', foodId, grams: 50 },
      })
    ).status,
  ).toBe(201);
  expect((await me('/me/hydration-logs', { volumeMl: 250 })).status).toBe(201);
  expect((await me('/me/hydration-logs', { volumeMl: 250 })).status).toBe(201);
  expect((await me('/me/metrics', { metricCode: 'BODY_WEIGHT', value: 62.4 })).status).toBe(201);
  expect((await me('/me/notes', { body: 'Hoy me dolió la rodilla al bajar.' })).status).toBe(201);
  const training = (await harness.get('/me/training', patientCookie)).body as {
    sessions: { id: string; exercises: { exerciseId: string }[] }[];
  };
  const session = training.sessions[0];
  expect(
    (
      await me('/me/workouts', {
        sessionId: session?.id,
        outcome: 'COMPLETED',
        durationMinutes: 40,
        sessionRpe: 7,
        sets: [
          { exerciseId: session?.exercises[0]?.exerciseId, setNo: 1, reps: 8, loadKg: 60 },
          { exerciseId: session?.exercises[0]?.exerciseId, setNo: 2, reps: 8, loadKg: 60 },
        ],
      })
    ).status,
  ).toBe(201);
  expect((await me('/me/checkins', { sleepHours: 7, fatigue: 2 })).status).toBe(201);
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-G01 · el equipo ve los registros en solo lectura', () => {
  it('el día con sus comidas, el agua, el peso, la nota, la sesión con sus series y el registro diario; la lectura se audita', async () => {
    const day = await readDay();

    expect(day.foods).toEqual([
      expect.objectContaining({ itemName: 'Avena de prueba', grams: 50 }),
    ]);
    expect(day.hydration).toHaveLength(2);
    expect(day.waterMl).toBe(500);
    expect(day.metrics[0]).toMatchObject({ metricCode: 'BODY_WEIGHT', value: 62.4 });
    expect(day.notes[0]).toMatchObject({ body: 'Hoy me dolió la rodilla al bajar.', readAt: null });
    expect(day.workouts[0]).toMatchObject({ tonnageKg: 960, sets: [{ setNo: 1 }, { setNo: 2 }] });
    expect(day.checkin?.readiness?.methodCode).toBe('READINESS_JV');
    expect(day.adjustments).toEqual([]);
    expect(day.totals).toEqual(day.originalTotals);

    const [audited] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'tracking.day' AND patient_id = $1`,
      [patientId],
    );
    expect(audited?.n).toBeGreaterThan(0);
  });

  it('RN-A05: quien no es de su equipo no lo ve', async () => {
    const response = await harness.get(
      `/patients/${patientId}/records/${today()}`,
      org.staff.outsider.cookie,
    );
    expect(response.status).toBe(404);
  });
});

describe('RN-G02 · el profesional ajusta con motivo y el original se conserva', () => {
  it('excluir el agua repetida: el día cuenta 250 ml y el registro sigue como lo dejó la paciente', async () => {
    const before = await readDay();
    const target = before.hydration[1];

    const excluded = await adjust({
      targetType: 'HYDRATION',
      targetId: target?.id,
      action: 'EXCLUDE',
    });

    expect(excluded.status, JSON.stringify(excluded.body)).toBe(201);
    expect(excluded.body).toMatchObject({
      action: 'EXCLUDE',
      correctedValues: null,
      authorMemberId: org.staff.responsible.memberId,
    });
    const after = await readDay();
    expect(after.waterMl).toBe(250);
    expect(after.originalWaterMl).toBe(500);
    const [row] = await owner<{ status: string; volume_ml: number }>(
      `SELECT status, volume_ml FROM tracking.hydration_log WHERE id = $1`,
      [target?.id],
    );
    expect(row).toEqual({ status: 'ACTIVE', volume_ml: 250 });
  });

  it('corregir la comida en gramos escala sus nutrientes; los totales del día usan el valor ajustado', async () => {
    const before = await readDay();
    const food = before.foods[0];

    const corrected = await adjust({
      targetType: 'FOOD',
      targetId: food?.id,
      action: 'CORRECT',
      correctedValues: { grams: 100 },
    });

    expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);
    expect(corrected.body).toMatchObject({ correctedValues: { grams: 100, kcal: 380 } });
    const after = await readDay();
    expect(after.totals.kcal.value).toBeCloseTo(380, 6);
    expect(after.originalTotals.kcal.value).toBeCloseTo(190, 6);
    expect(after.foods[0]?.grams).toBe(50);
  });

  it('la serie y la sesión: repeticiones, peso, duración y RPE; el peso, dentro de su rango (RN-C04)', async () => {
    const day = await readDay();
    const workout = day.workouts[0];

    const set = await adjust({
      targetType: 'SET',
      targetId: workout?.sets[0]?.id,
      action: 'CORRECT',
      correctedValues: { loadKg: 50 },
    });
    expect(set.body).toMatchObject({ correctedValues: { reps: 8, loadKg: 50, tonnageKg: 400 } });
    const session = await adjust({
      targetType: 'WORKOUT',
      targetId: workout?.id,
      action: 'CORRECT',
      correctedValues: { sessionRpe: 8 },
    });
    expect(session.body).toMatchObject({ correctedValues: { durationMinutes: 40, sessionRpe: 8 } });

    const weight = day.metrics[0]?.id;
    const outside = await adjust({
      targetType: 'METRIC',
      targetId: weight,
      action: 'CORRECT',
      correctedValues: { value: 500 },
    });
    expect(outside.status).toBe(422);
    expect((outside.body as Problem).code).toBe('NC-TRK-009');
    const inside = await adjust({
      targetType: 'METRIC',
      targetId: weight,
      action: 'CORRECT',
      correctedValues: { value: 61.9 },
    });
    expect(inside.status).toBe(201);
  });

  it('ADR-085: el registro diario solo se excluye; sin motivo o en otra unidad no se ajusta', async () => {
    const day = await readDay();
    const checkin = day.checkin?.id;

    expect(
      (
        await adjust({
          targetType: 'CHECKIN',
          targetId: checkin,
          action: 'CORRECT',
          correctedValues: { value: 1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await adjust({ targetType: 'CHECKIN', targetId: checkin, action: 'EXCLUDE' })).status,
    ).toBe(201);
    expect(
      (
        await adjust({
          targetType: 'HYDRATION',
          targetId: day.hydration[0]?.id,
          action: 'EXCLUDE',
          reason: 'Error',
        })
      ).status,
    ).toBe(400);
    const otherUnit = await adjust({
      targetType: 'FOOD',
      targetId: day.foods[0]?.id,
      action: 'CORRECT',
      correctedValues: { servings: 2 },
    });
    expect(otherUnit.status).toBe(422);
    expect((otherUnit.body as Problem).code).toBe('NC-TRK-013');
  });

  it('un registro de otro día, de otro paciente o inventado no existe para el ajuste', async () => {
    const day = await readDay();
    const otherDay = await adjust({
      targetType: 'HYDRATION',
      targetId: day.hydration[0]?.id,
      targetLocalDate: '2026-01-01',
      action: 'EXCLUDE',
    });
    expect(otherDay.status).toBe(404);
    expect((await adjust({ targetType: 'FOOD', targetId: uuid(), action: 'EXCLUDE' })).status).toBe(
      404,
    );
  });

  it('RN-A05: el dueño lo ve, pero solo el equipo con acceso de escritura ajusta', async () => {
    const day = await readDay(org.staff.owner.cookie);
    const response = await adjust(
      { targetType: 'HYDRATION', targetId: day.hydration[0]?.id, action: 'EXCLUDE' },
      org.staff.owner.cookie,
    );
    expect(response.status).toBe(403);
  });

  it('el ajuste no se edita (la base se lo niega a app_user) y la paciente no lo ve; su día sigue igual', async () => {
    const context = {
      orgId: org.organizationId,
      role: 'OWNER' as const,
      userId: org.staff.owner.userId,
    };
    await withContext('user', context, async (client) => {
      expect(
        await errorCode(client, `UPDATE tracking.log_adjustment SET reason = 'cambiado a mano'`),
      ).toBe(PG.insufficientPrivilege);
    });
    const [account] = await owner<{ user_id: string }>(
      `SELECT user_id FROM clinical.patient WHERE id = $1`,
      [patientId],
    );
    const seen = await withContext(
      'user',
      { orgId: org.organizationId, role: 'PATIENT', userId: account?.user_id, patientId },
      async (client) =>
        (
          await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM tracking.log_adjustment`,
          )
        ).rows,
    );
    expect(seen).toEqual([{ n: 0 }]);
    const mine = await harness.get(`/me/days/${today()}`, patientCookie);
    expect((mine.body as { waterMl: number }).waterMl).toBe(500);
  });

  it('RN-B03: cada ajuste queda en la auditoría con los nombres de lo corregido, nunca sus valores', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{ changed_fields: string[] }>(
      `SELECT changed_fields FROM audit.audit_log
       WHERE resource_type = 'tracking.log_adjustment' AND patient_id = $1 ORDER BY occurred_at`,
      [patientId],
    );
    expect(rows.map((row) => row.changed_fields)).toEqual(
      expect.arrayContaining([['status'], ['grams'], ['loadKg'], ['sessionRpe'], ['value']]),
    );
  });
});

describe('RN-G13 · las notas de la paciente, sin leer hasta que alguien del equipo las abre', () => {
  it('aparecen sin leer; abrirlas las marca leídas por quien las abrió, una sola vez', async () => {
    const unread = appNotesResponseSchema.parse(
      (await harness.get(`/patients/${patientId}/app-notes/unread`, cookie)).body,
    );
    expect(unread.notes).toEqual([
      expect.objectContaining({ body: 'Hoy me dolió la rodilla al bajar.', readAt: null }),
    ]);
    const noteIds = unread.notes.map((note) => note.id);

    const marked = await harness.post(`/patients/${patientId}/app-notes/read`, { noteIds }, cookie);
    expect(marked.body).toEqual({ marked: 1 });
    expect(
      (await harness.post(`/patients/${patientId}/app-notes/read`, { noteIds }, cookie)).body,
    ).toEqual({ marked: 0 });

    const after = await harness.get(`/patients/${patientId}/app-notes/unread`, cookie);
    expect((after.body as { notes: unknown[] }).notes).toEqual([]);
    const [row] = await owner<{ read_by: string; read_at: Date | null }>(
      `SELECT read_by, read_at FROM tracking.note_log WHERE id = $1`,
      [noteIds[0]],
    );
    expect(row?.read_by).toBe(org.staff.responsible.memberId);
    expect(row?.read_at).not.toBeNull();
    // La paciente no ve quién ni cuándo la leyó.
    const mine = (await harness.get(`/me/days/${today()}`, patientCookie)).body as {
      notes: Record<string, unknown>[];
    };
    expect(mine.notes[0]).not.toHaveProperty('readAt');
  });
});
