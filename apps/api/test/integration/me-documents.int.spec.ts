import { documentStatusSchema, mySheetsSchema } from '@nutricoach/contracts';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription, patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 6c) · las fichas vigentes en la app del paciente, contra PostgreSQL como app_user (ADR-080, ADR-095): Luis ve la ficha
 * de su plan vigente, la pide por su nombre y la descarga con su sesión; la API elige el origen (nunca lo envía el paciente), otra
 * paciente no la ve y la descarga queda auditada (RN-B03). Datos sintéticos.
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
const PASSWORD = 'un-cielo-gris-sobre-lima';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let luisId: string;
let prescriptionId: string;
let planId: string;
let luis: string;
let ines: string;
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

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

/** G-18 con un alimento propio de cada grupo; al publicarlo, tracking deja su copia vigente (active_plan_view). */
async function publishedPlan(): Promise<string> {
  const created = await harness.post(
    `/patients/${luisId}/nutrition-plans`,
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

async function appSession(patientId: string): Promise<string> {
  const email = `app-${id()}@demo.test`;
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

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const created = await luisWithPrescription(harness, org);
  luisId = created.patientId;
  prescriptionId = created.prescriptionId;
  for (const group of GROUPS) {
    const food = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (fichas)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 150, PROCNT: 10, FAT: 5, CHOCDF: 15, FE: 2 },
      },
      cookie,
    );
    foods[group] = (food.body as { id: string }).id;
  }
  planId = await publishedPlan();
  luis = await appSession(luisId);
  const inesId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  ines = await appSession(inesId);
});

afterAll(async () => {
  await harness.stop();
});

describe('ADR-080 · ADR-095 · las fichas vigentes en la app', () => {
  it('Luis tiene la de su plan vigente y la de su evaluación; sin rutina ni segunda evaluación, nada más. Inés, ninguna', async () => {
    const mine = mySheetsSchema.parse((await harness.get('/me/documents', luis)).body);
    expect(mine.sheets).toEqual([{ item: 'PLAN' }, { item: 'RESULTS' }]);
    expect(mySheetsSchema.parse((await harness.get('/me/documents', ines)).body).sheets).toEqual(
      [],
    );
  });

  it('la pide por su nombre: la API elige el origen; si el worker no la tiene, 202 y luego está', async () => {
    const requested = await harness.post('/me/documents', { item: 'PLAN' }, luis);
    expect([200, 202], JSON.stringify(requested.body)).toContain(requested.status);
    await harness.deliver('documents.sheets');

    const status = documentStatusSchema.parse(
      (await harness.get('/me/documents/status?item=PLAN', luis)).body,
    );
    expect(status.status).toBe('READY');
    if (status.status !== 'READY') return;
    expect(status.document).toMatchObject({
      kind: 'EXCHANGE_DIET',
      sourceType: 'NUTRITION_PLAN',
      sourceId: planId,
    });

    // El paciente no envía un origen: el cuerpo solo admite el nombre de la ficha.
    const forged = await harness.post(
      '/me/documents',
      { item: 'PLAN', sourceType: 'NUTRITION_PLAN', sourceId: planId },
      ines,
    );
    expect(forged.status).toBe(400);
    expect((await harness.post('/me/documents', { item: 'PLAN' }, ines)).status).toBe(404);
    // Con una sola evaluación no hay evolución.
    expect((await harness.post('/me/documents', { item: 'EVOLUTION' }, luis)).status).toBe(404);
  });

  it('la descarga con su sesión, como adjunto; Inés no; queda auditada como exportación (RN-B03)', async () => {
    const status = documentStatusSchema.parse(
      (await harness.get('/me/documents/status?item=PLAN', luis)).body,
    );
    if (status.status !== 'READY') throw new Error('La ficha debía estar lista.');
    const file = await harness.get(`/me/documents/${status.document.id}/file`, luis);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toBe(
      `attachment; filename="${status.document.fileName}"`,
    );
    expect(
      Buffer.from(file.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    expect((await harness.get(`/me/documents/${status.document.id}/file`, ines)).status).toBe(404);

    const audited = await owner<{ actor_role: string }>(
      `SELECT actor_role FROM audit.audit_log
       WHERE resource_type = 'documents.generated_document' AND action = 'EXPORT' AND resource_id = $1`,
      [status.document.id],
    );
    expect(audited.map((row) => row.actor_role)).toEqual(['PATIENT']);
  });

  it('el equipo no usa las rutas del paciente', async () => {
    expect((await harness.get('/me/documents', cookie)).status).toBe(403);
  });
});
