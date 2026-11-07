import { overviewResponseSchema, patientListResponseSchema } from '@nutricoach/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 6a) · el panel del profesional con alertas, contra PostgreSQL como app_user (RF-34, ADR-093): sin registros en 3 días,
 * adherencia de 7 días baja, notas sin leer y el semáforo del día, en la fecha local del paciente (RN-G04). Solo lo ve su equipo
 * de atención (RN-A05) y la lectura queda en la auditoría (RN-B03). Datos sintéticos.
 */

const GLOBAL_THRESHOLD = '019a2000-0000-7000-8000-000000000001';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let luisId: string;
let inesId: string;
let anaId: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const limaToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const dayBefore = (days: number): string =>
  new Date(Date.parse(`${limaToday()}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Un día con meta de 1834.54 kcal y, si se indica, una comida con esas kcal (en rango entre 90 % y 110 %). */
async function day(patientId: string, localDate: string, kcal: number | null): Promise<void> {
  await owner(
    `INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, kcal, cho_g, protein_g, fat_g, water_ml)
     VALUES ($1, $2, $3, 1834.54, 184, 160, 51, 2500)`,
    [patientId, localDate, org.organizationId],
  );
  if (kcal === null) return;
  await owner(
    `INSERT INTO tracking.food_log (id, local_date, organization_id, patient_id, logged_at, meal_slot_code, item_type,
       item_name, grams, kcal, cho_g, protein_g, fat_g, in_plan, client_id, created_by)
     VALUES ($1, $2, $3, $4, $5, 'LUNCH', 'FOOD', 'Plato de prueba', 500, $6, 200, 150, 50, false, $7, $8)`,
    [
      uuid(),
      localDate,
      org.organizationId,
      patientId,
      `${localDate}T17:00:00Z`,
      kcal,
      uuid(),
      org.staff.responsible.userId,
    ],
  );
}

/** El registro diario de ese día con la indicación de su recuperación (RN-G15), como lo dejó READINESS_JV. */
async function checkin(patientId: string, localDate: string, indication: string): Promise<void> {
  const checkinId = uuid();
  await owner(
    `INSERT INTO tracking.daily_checkin (id, local_date, organization_id, patient_id, sleep_hours, client_id)
     VALUES ($1, $2, $3, $4, 5, $5)`,
    [checkinId, localDate, org.organizationId, patientId, uuid()],
  );
  await owner(
    `INSERT INTO tracking.daily_readiness (id, local_date, organization_id, patient_id, checkin_id, method_code,
       method_version, engine_version, threshold_id, inputs, inputs_hash, components, indication, computed_at)
     VALUES ($1, $2, $3, $4, $5, 'READINESS_JV', '3.0.0', '1.6.0', $6, '{}', '\\x00', '{}', $7, now())`,
    [uuid(), localDate, org.organizationId, patientId, checkinId, GLOBAL_THRESHOLD, indication],
  );
}

const overview = async (query = '', as = cookie) => {
  const response = await harness.get(`/analytics/overview${query}`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return overviewResponseSchema.parse(response.body);
};

const alertsOf = async (patientId: string) =>
  (await overview()).patients.find((patient) => patient.patientId === patientId)?.alerts ?? [];

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const person = (firstName: string, sex: 'F' | 'M', birthDate: string) =>
    patientWithConsent(harness, org, { firstName, lastName: 'Sintética', sex, birthDate });
  luisId = await person('Luis', 'M', '1998-03-14');
  inesId = await person('Inés', 'F', '1993-07-21');
  anaId = await person('Ana', 'F', '1990-01-09');

  // Luis registró los 7 días que terminaron ayer, 4 en rango (57.1 %), y su registro diario de ayer salió en rojo.
  for (const [i, kcal] of [1790, 1950, 1600, 2100, 1830, 2400, 1700].entries()) {
    await day(luisId, dayBefore(7 - i), kcal);
  }
  await checkin(luisId, dayBefore(1), 'RED');
  // Inés registró hasta hace 4 días, en rango; desde entonces, solo metas.
  for (let back = 10; back >= 1; back -= 1)
    await day(inesId, dayBefore(back), back >= 4 ? 1834 : null);
  // Ana está al día: los 7 días en rango.
  for (let back = 7; back >= 1; back -= 1) await day(anaId, dayBefore(back), 1834);

  const rebuild = harness.app.get(AnalyticsRebuild);
  for (const patientId of [luisId, inesId, anaId]) await rebuild.patient(patientId);
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-34 · las alertas del panel, en la fecha local del paciente (ADR-093)', () => {
  it('RN-G09 · RN-G15: Luis tiene la adherencia de 7 días baja y el semáforo de ayer en rojo', async () => {
    const page = await overview();
    const luis = page.patients.find((patient) => patient.patientId === luisId);

    expect(luis?.alerts).toEqual(['LOW_ADHERENCE', 'READINESS_RED']);
    expect(luis?.adherence7dPct).toBeCloseTo((4 / 7) * 100, 1);
    expect(luis?.lastLogDate).toBe(dayBefore(1));
    expect(luis?.nextAppointmentAt).toBeNull();
  });

  it('sin registros en los 3 días que ya terminaron; un paciente al día no aparece', async () => {
    const page = await overview();

    // Sus 3 días sin registros también cuentan en la adherencia: 4 de 7.
    expect(await alertsOf(inesId)).toEqual(['NO_RECENT_LOGS', 'LOW_ADHERENCE']);
    expect(page.patients.map((patient) => patient.patientId)).not.toContain(anaId);
    expect(page.total).toBe(2);
    expect(page.counts).toMatchObject({ LOW_ADHERENCE: 2, READINESS_RED: 1, NO_RECENT_LOGS: 1 });
    // A igual número de alertas, primero quien lleva más días sin registrar.
    expect(page.patients.map((patient) => patient.patientId)).toEqual([inesId, luisId]);
  });

  it('RN-G13 · una nota de Ana enciende la alerta; leerla la apaga, por los eventos de tracking', async () => {
    const noteId = uuid();
    const localDate = dayBefore(0);
    await owner(
      `INSERT INTO tracking.note_log (id, local_date, organization_id, patient_id, body, client_id)
       VALUES ($1, $2, $3, $4, 'Nota sintética', $5)`,
      [noteId, localDate, org.organizationId, anaId, uuid()],
    );
    await harness.app.get(AnalyticsRebuild).patient(anaId);
    expect(await alertsOf(anaId)).toEqual(['UNREAD_NOTES']);

    const read = await harness.post(
      `/patients/${anaId}/app-notes/read`,
      { noteIds: [noteId] },
      cookie,
    );
    expect(read.status, JSON.stringify(read.body)).toBeLessThan(300);
    await harness.deliver('analytics.overview');

    expect(await alertsOf(anaId)).toEqual([]);
  });

  it('el filtro por alerta y los nombres desde /patients, sin que analytics los lea (ADR-064)', async () => {
    const red = await overview('?alert=READINESS_RED');
    expect(red.patients.map((patient) => patient.patientId)).toEqual([luisId]);
    expect(red.total).toBe(1);

    const names = await harness.get(`/patients?ids=${luisId},${inesId}`, cookie);
    expect(names.status, JSON.stringify(names.body)).toBe(200);
    expect(
      patientListResponseSchema
        .parse(names.body)
        .patients.map((patient) => patient.firstName)
        .sort(),
    ).toEqual(['Inés', 'Luis']);

    expect((await harness.get('/analytics/overview?limit=0', cookie)).status).toBe(400);
    expect((await harness.get('/patients?ids=no-es-un-id', cookie)).status).toBe(400);
  });

  it('RN-A05 · un profesional fuera del equipo de atención no ve a nadie; la lectura queda auditada (RN-B03)', async () => {
    const outsider = await overview('', org.staff.outsider.cookie);
    expect(outsider.patients).toEqual([]);
    expect(outsider.total).toBe(0);

    const audited = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'analytics.patient_overview' AND action = 'READ'`,
      [org.organizationId],
    );
    expect(Number(audited[0]?.n)).toBeGreaterThan(0);
  });

  it('un paciente archivado sale del panel', async () => {
    const archived = await harness.post(`/patients/${inesId}/archive`, undefined, cookie);
    expect(archived.status, JSON.stringify(archived.body)).toBeLessThan(300);
    await harness.app.get(AnalyticsRebuild).patient(inesId);

    expect((await overview()).patients.map((patient) => patient.patientId)).not.toContain(inesId);
  });
});
