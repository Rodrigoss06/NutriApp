import { dietAnalyticsSchema, type DietAnalytics } from '@nutricoach/contracts';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 2a) · la analítica de dieta, contra PostgreSQL como app_user (RF-32): la semana de G-20 (criterio 1), un ajuste del
 * profesional que cambia el resumen del día (criterio 2, RN-G02) y una reconstrucción que da los mismos números (criterio 3). La
 * lectura es del equipo de atención (RN-A05) y queda en la auditoría (RN-B03). Datos sintéticos.
 */

const PASSWORD = 'un-cielo-gris-sobre-lima';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let inesId: string;
let luisId: string;
let patientCookie: string;

/** La semana de G-20, de lunes a domingo, contra la meta encadenada de Luis (≈ 1834.54 kcal). */
const WEEK = [
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
];
const G20_KCAL = [1790, 1950, 1600, 2100, 1830, 2400, 1700];

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

const diet = async (patientId: string, query = '', as = cookie): Promise<DietAnalytics> => {
  const response = await harness.get(`/patients/${patientId}/analytics/diet${query}`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return dietAnalyticsSchema.parse(response.body);
};

/** El resumen guardado, sin la marca de tiempo técnica: lo que debe repetir una reconstrucción. */
const summaryRows = (patientId: string) =>
  owner<Record<string, unknown>>(
    `SELECT to_jsonb(s) - 'updated_at' AS row FROM analytics.patient_daily_summary s
     WHERE patient_id = $1 ORDER BY local_date`,
    [patientId],
  );

async function appSession(patientId: string): Promise<string> {
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

/** La semana de G-20 escrita directo en tracking, como si Luis la hubiera registrado: un día cerrado no se registra por /me. */
async function seedG20Week(patientId: string): Promise<void> {
  for (const [i, date] of WEEK.entries()) {
    await owner(
      `INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, kcal, cho_g, protein_g, fat_g, water_ml)
       VALUES ($1, $2, $3, 1834.54, 184, 160, 51, 2500)`,
      [patientId, date, org.organizationId],
    );
    await owner(
      `INSERT INTO tracking.food_log (id, local_date, organization_id, patient_id, logged_at, meal_slot_code, item_type,
         item_name, grams, kcal, cho_g, protein_g, fat_g, in_plan, client_id, created_by)
       VALUES ($1, $2, $3, $4, $5, 'LUNCH', 'FOOD', 'Plato de prueba', 500, $6, 200, 150, 50, false, $7, $8)`,
      [
        uuid(),
        date,
        org.organizationId,
        patientId,
        `${date}T17:00:00Z`,
        G20_KCAL[i],
        uuid(),
        org.staff.responsible.userId,
      ],
    );
  }
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  inesId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  luisId = await patientWithConsent(harness, org, {
    firstName: 'Luis',
    lastName: 'Sintético',
    sex: 'M',
    birthDate: '1998-03-14',
  });
  patientCookie = await appSession(inesId);
  await seedG20Week(luisId);
  await harness.app.get(AnalyticsRebuild).patient(luisId);
});

afterAll(async () => {
  await harness.app.close();
});

describe('Criterio 1 de P14 · G-20 · RN-E10 · RN-G09 · la semana de Luis', () => {
  it('promedio 1910 kcal, adecuación 104.1 % y 4 de 7 días en rango, con el método', async () => {
    const analytics = await diet(luisId, `?from=${WEEK[0] ?? ''}&to=${WEEK[6] ?? ''}`);
    const [week] = analytics.weeks;

    expect(analytics.weeks).toHaveLength(1);
    expect(week?.weekStart).toBe('2026-10-26');
    expect(week?.kcal.consumed).toBe(1910);
    expect(week?.kcal.adequacyPct).toBeCloseTo(104.1, 1);
    expect(week?.daysInRange).toBe(4);
    expect([week?.daysWithTarget, week?.daysLogged]).toEqual([7, 7]);
    expect(analytics.days.map((day) => day.kcalInRange)).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(analytics.method).toEqual({ code: 'ADEQUACY', version: '1.0.0' });
    expect(analytics.adequacyRangePct).toEqual([90, 110]);
  });

  it('sin rango, las últimas 4 semanas hasta hoy; un rango al revés o de más de 371 días es 400', async () => {
    const analytics = await diet(luisId);
    expect(analytics.to).toBe(today());

    const reversed = await harness.get(
      `/patients/${luisId}/analytics/diet?from=2026-11-01&to=2026-10-26`,
      cookie,
    );
    expect([reversed.status, (reversed.body as { code: string }).code]).toEqual([
      400,
      'NC-ANA-001',
    ]);
    const tooLong = await harness.get(
      `/patients/${luisId}/analytics/diet?from=2025-01-01&to=2026-11-01`,
      cookie,
    );
    expect(tooLong.status).toBe(400);
  });

  it('RN-A05 · fuera del equipo de atención el paciente no existe; RN-B03 · la lectura queda auditada', async () => {
    const outside = await harness.get(
      `/patients/${luisId}/analytics/diet`,
      org.staff.outsider.cookie,
    );
    expect(outside.status).toBe(404);

    const reads = await owner<{ count: string }>(
      `SELECT count(*) FROM audit.audit_log
       WHERE patient_id = $1 AND action = 'READ' AND resource_type = 'analytics.patient_daily_summary'`,
      [luisId],
    );
    expect(Number(reads[0]?.count)).toBeGreaterThan(0);
  });
});

describe('Criterio 2 de P14 · RN-G02 · un ajuste del profesional cambia el resumen del día', () => {
  it('lo registrado por la app entra al resumen y el ajuste lo corrige sin tocar el original', async () => {
    const food = await harness.post(
      '/foods',
      {
        name: 'Avena de prueba',
        state: 'READY',
        nutrients: { ENERC_KCAL: 380, PROCNT: 13, FAT: 7, CHOCDF: 60 },
      },
      cookie,
    );
    const logged = await harness.post(
      '/me/food-logs',
      {
        clientId: uuid(),
        localDate: today(),
        source: {
          kind: 'CATALOG',
          mealSlotCode: 'BREAKFAST',
          foodId: (food.body as { id: string }).id,
          grams: 50,
        },
      },
      patientCookie,
    );
    expect(logged.status, JSON.stringify(logged.body)).toBe(201);
    await harness.deliver('analytics.daily-summary');

    const before = (await diet(inesId)).days.find((day) => day.localDate === today());
    expect(before?.kcal).toBe(190);
    expect(before?.mealsLogged).toBe(1);
    expect(before?.offPlanItems).toBe(1);

    const record = (await harness.get(`/patients/${inesId}/records/${today()}`, cookie)).body as {
      foods: { id: string }[];
    };
    const adjusted = await harness.post(
      `/patients/${inesId}/record-adjustments`,
      {
        targetType: 'FOOD',
        targetId: record.foods[0]?.id,
        targetLocalDate: today(),
        action: 'CORRECT',
        correctedValues: { grams: 100 },
        reason: 'Comió el doble de lo que registró.',
      },
      cookie,
    );
    expect(adjusted.status, JSON.stringify(adjusted.body)).toBe(201);
    await harness.deliver('analytics.daily-summary');

    const after = (await diet(inesId)).days.find((day) => day.localDate === today());
    expect(after?.kcal).toBe(380);
    const [original] = await owner<{ kcal: string }>(
      `SELECT kcal FROM tracking.food_log WHERE patient_id = $1 AND status = 'ACTIVE'`,
      [inesId],
    );
    expect(Number(original?.kcal)).toBe(190);
  });
});

describe('Criterio 3 de P14 · reconstruir la analítica da exactamente los mismos números', () => {
  it('lo que dejó el consumidor y lo reconstruido coinciden fila por fila', async () => {
    const built = await summaryRows(inesId);
    expect(built.length).toBeGreaterThan(0);

    await harness.app.get(AnalyticsRebuild).patient(inesId);

    expect(await summaryRows(inesId)).toEqual(built);
  });

  it('reconstruir dos veces la semana de G-20 da lo mismo', async () => {
    const first = await summaryRows(luisId);
    const report = await harness.app.get(AnalyticsRebuild).patient(luisId);

    expect(report?.days).toBeGreaterThanOrEqual(7);
    expect(await summaryRows(luisId)).toEqual(first);
  });

  it('un paciente que no existe no se reconstruye', async () => {
    expect(await harness.app.get(AnalyticsRebuild).patient(uuid())).toBeNull();
  });
});
