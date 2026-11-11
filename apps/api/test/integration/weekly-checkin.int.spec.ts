import { meTodaySchema, weeklyCheckinSchema } from '@nutricoach/contracts';
import {
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type OrganizationId,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeekCheckinSources } from '../../src/modules/training/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14.5, PR 5a · el check-in de la semana por la API (P-21 y P-22, respuestas de Jeremy; ADR-109): del domingo al martes siguiente,
 * con la alimentación de la semana, el peso si su app lo permite y un comentario que llega a su equipo como nota sin leer. Otra vez
 * en el plazo, lo corrige; el control semanal lee esa alimentación. El reloj de la API se fija en el último domingo, en Lima.
 * Datos sintéticos.
 */

class FakeClock implements Clock {
  current = new Date();
  now(): Date {
    return new Date(this.current);
  }
}

const PASSWORD = 'un-cielo-gris-sobre-lima';
const DAY_MS = 86_400_000;
const limaDate = (instant: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(instant);
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** El último domingo en Lima (hoy, si es domingo), a las 12:00 de Lima. */
const SUNDAY = (() => {
  const today = limaDate(new Date());
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, -weekday);
})();
const noonIn = (date: string): Date => new Date(`${date}T12:00:00-05:00`);

const clock = new FakeClock();
clock.current = noonIn(SUNDAY);
const harness = new ApiHarness(clock);
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

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

const checkin = (body: object) =>
  harness.post(
    '/me/weekly-checkins',
    { clientId: uuid(), weekDate: SUNDAY, nutritionCompliancePct: 80, ...body },
    patientCookie,
  );

const today = async () => {
  const response = await harness.get('/me/today', patientCookie);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return meTodaySchema.parse(response.body);
};

const weightSetting = async (allowWeightLog: boolean) => {
  const saved = await harness.put(
    `/patients/${patientId}/app-settings`,
    { themeColor: null, welcomeMessage: null, enabledSections: [], allowWeightLog },
    cookie,
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  patientCookie = await appSession();
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-G11 · P-21 · el check-in de la semana, del domingo al martes', () => {
  it('el domingo, Hoy lo trae abierto hasta el martes y pide el peso si su app lo permite', async () => {
    clock.current = noonIn(SUNDAY);
    expect((await today()).weeklyCheckin).toEqual({
      weekDate: SUNDAY,
      closesOn: addDays(SUNDAY, 2),
      asksWeight: true,
      done: null,
    });
  });

  it('con su peso y un comentario: el peso es su medida del día y el comentario, una nota sin leer para su equipo (RN-G13)', async () => {
    clock.current = noonIn(SUNDAY);
    const clientId = uuid();
    const body = {
      clientId,
      nutritionCompliancePct: 78,
      bodyWeightKg: 79.5,
      comment: 'Semana con cenas tarde por trabajo.',
    };
    const sent = await checkin(body);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const stored = weeklyCheckinSchema.parse(sent.body);
    expect(stored).toMatchObject({
      weekDate: SUNDAY,
      loggedOn: SUNDAY,
      nutritionCompliancePct: 78,
      withWeight: true,
      withComment: true,
    });
    // RN-G08: el mismo clientId no duplica; vuelve lo de la primera vez.
    const again = await checkin(body);
    expect(again.status).toBe(200);
    expect(weeklyCheckinSchema.parse(again.body).id).toBe(stored.id);

    const [row] = await owner<{ metric_log_id: string; note_id: string }>(
      `SELECT metric_log_id, note_id FROM tracking.weekly_checkin WHERE id = $1`,
      [stored.id],
    );
    expect(
      await owner(`SELECT value::float AS value, status FROM tracking.metric_log WHERE id = $1`, [
        row?.metric_log_id,
      ]),
    ).toEqual([{ value: 79.5, status: 'ACTIVE' }]);
    expect(
      await owner(`SELECT body, read_at FROM tracking.note_log WHERE id = $1`, [row?.note_id]),
    ).toEqual([{ body: 'Semana con cenas tarde por trabajo.', read_at: null }]);
    expect((await today()).weeklyCheckin?.done?.id).toBe(stored.id);
  });

  it('RN-G12 · el lunes lo corrige: el anterior y su peso quedan anulados, nunca borrados; la nota queda', async () => {
    clock.current = noonIn(addDays(SUNDAY, 1));
    const sent = await checkin({ nutritionCompliancePct: 82 });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(weeklyCheckinSchema.parse(sent.body)).toMatchObject({
      loggedOn: addDays(SUNDAY, 1),
      nutritionCompliancePct: 82,
      withWeight: false,
      withComment: false,
    });
    const rows = await owner<{ status: string; metric: string | null; note: string | null }>(
      `SELECT c.status, m.status AS metric, n.body AS note
       FROM tracking.weekly_checkin c
       LEFT JOIN tracking.metric_log m ON m.id = c.metric_log_id
       LEFT JOIN tracking.note_log n ON n.id = c.note_id
       WHERE c.patient_id = $1 ORDER BY c.created_at`,
      [patientId],
    );
    expect(rows).toEqual([
      { status: 'VOIDED', metric: 'VOIDED', note: 'Semana con cenas tarde por trabajo.' },
      { status: 'ACTIVE', metric: null, note: null },
    ]);
    expect((await today()).weeklyCheckin?.done?.nutritionCompliancePct).toBe(82);
  });

  it('P-22 · el control semanal lee la alimentación del domingo de su semana', async () => {
    const uow = harness.app.get<UnitOfWork>(UNIT_OF_WORK);
    const weekly = await uow.query(systemContext(org.organizationId as OrganizationId), () =>
      harness.app
        .get(WeekCheckinSources)
        .get()
        .weeklyNutrition(patientId, addDays(SUNDAY, -6), SUNDAY),
    );
    expect(weekly).toBe(82);
  });

  it('el miércoles ya cerró: Hoy no lo trae y enviarlo da NC-TRK-020; un día que no es domingo, NC-TRK-019', async () => {
    clock.current = noonIn(addDays(SUNDAY, 3));
    expect((await today()).weeklyCheckin).toBeNull();
    const closed = await checkin({});
    expect(closed.status).toBe(422);
    expect(closed.body).toMatchObject({ code: 'NC-TRK-020', rule: 'RN-G11' });

    clock.current = noonIn(addDays(SUNDAY, 1));
    const monday = await checkin({ weekDate: addDays(SUNDAY, 1) });
    expect(monday.status).toBe(422);
    expect(monday.body).toMatchObject({ code: 'NC-TRK-019' });
  });

  it('sin el peso en casa, Hoy no lo pide y un check-in con peso no se guarda', async () => {
    clock.current = noonIn(SUNDAY);
    await weightSetting(false);
    expect((await today()).weeklyCheckin?.asksWeight).toBe(false);
    const sent = await checkin({ bodyWeightKg: 80 });
    expect(sent.status).toBe(422);
    expect((sent.body as { code: string }).code).toMatch(/^NC-TRK-/);
    expect((await today()).weeklyCheckin?.done?.nutritionCompliancePct).toBe(82);
    await weightSetting(true);
  });

  it('un porcentaje fuera de 0 a 100 no pasa el contrato', async () => {
    clock.current = noonIn(SUNDAY);
    expect((await checkin({ nutritionCompliancePct: 101 })).status).toBe(400);
  });
});
