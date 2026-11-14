import {
  meAppSchema,
  organizationResponseSchema,
  planSchema,
  platformFeatureFlagsResponseSchema,
  platformOrganizationListResponseSchema,
} from '@nutricoach/contracts';
import { hash } from '@node-rs/argon2';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P15 · PR 3a · el panel interno por la API, contra PostgreSQL como app_user (RF-39; RN-A02, RN-A03, RN-A09; ADR-127): planes que
 * crea y cambia solo la plataforma, sin tocar las suscripciones vigentes; el uso del cupo de cada organización, solo con cuentas;
 * banderas por organización que apagan una función en la API, en el panel y en la app; todo en la auditoría. Datos sintéticos.
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let platformCookie: string;
let patientId: string;
let patientCookie: string;
const code = `PRUEBA_PLAN_${uuid().slice(-8).toUpperCase()}`;

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};
const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  const adminEmail = `plataforma-${uuid()}@demo.test`;
  await pool('owner').query(
    `INSERT INTO iam.user_account (id, email, password_hash, display_name, status, is_platform_admin)
     VALUES ($1, $2, $3, 'Soporte de prueba', 'ACTIVE', true)`,
    [uuid(), adminEmail, await hash(PASSWORD)],
  );
  const login = await harness.post('/auth/login', { email: adminEmail, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  platformCookie = sessionCookie(login);
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Nora',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-05-20',
  });
  await patientWithConsent(harness, org, {
    firstName: 'Iris',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1991-02-11',
  });
  const email = `nora-${uuid()}@demo.test`;
  const invited = await harness.post(
    `/patients/${patientId}/invitation`,
    { email },
    org.staff.responsible.cookie,
  );
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
  patientCookie = sessionCookie(accepted);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('RF-39 · RN-A03 · los planes los crea y los cambia solo la plataforma', () => {
  it('crear un plan; el código es único y no cambia', async () => {
    const created = await harness.post(
      '/platform/plans',
      {
        code,
        name: 'Tramo de prueba',
        maxActivePatients: 5,
        maxProfessionals: 2,
        durationMonths: 12,
        priceCents: 15_000,
        currency: 'PEN',
      },
      platformCookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(planSchema.parse(created.body)).toMatchObject({
      code,
      isActive: true,
      priceCents: 15_000,
    });
    const again = await harness.post(
      '/platform/plans',
      {
        code,
        name: 'Otro',
        maxActivePatients: 5,
        maxProfessionals: 2,
        durationMonths: 12,
        priceCents: 0,
        currency: 'PEN',
      },
      platformCookie,
    );
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'NC-TEN-045' });
    const invalid = await harness.post(
      '/platform/plans',
      {
        code: 'tramo chico',
        name: 'X',
        maxActivePatients: 5,
        maxProfessionals: 2,
        durationMonths: 12,
        priceCents: 0,
        currency: 'PEN',
      },
      platformCookie,
    );
    expect(invalid.status).toBe(400);
  });

  it('cambiar los límites no toca las suscripciones vigentes, que los tienen congelados', async () => {
    const before = await owner<{ max_active_patients: number }>(
      `SELECT max_active_patients FROM tenancy.subscription WHERE organization_id = $1 AND status = 'ACTIVE'`,
      [org.organizationId],
    );
    const plans = await harness.get('/platform/plans', platformCookie);
    const current = (plans.body as { plans: { code: string }[] }).plans.find((p) =>
      before.length > 0 ? p.code.startsWith('PRUEBA_') : false,
    );
    expect(current).toBeDefined();
    const updated = await harness.patch(
      `/platform/plans/${code}`,
      { maxActivePatients: 8, isActive: false },
      platformCookie,
    );
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(planSchema.parse(updated.body)).toMatchObject({ maxActivePatients: 8, isActive: false });
    const after = await owner<{ max_active_patients: number }>(
      `SELECT max_active_patients FROM tenancy.subscription WHERE organization_id = $1 AND status = 'ACTIVE'`,
      [org.organizationId],
    );
    expect(after).toEqual(before);
    expect(
      (await harness.patch('/platform/plans/NO_EXISTE', { name: 'X' }, platformCookie)).status,
    ).toBe(404);
  });

  it('el equipo no llega a las rutas del panel interno; en la base, solo la plataforma escribe planes', async () => {
    expect((await harness.get('/platform/plans', org.staff.owner.cookie)).status).toBe(403);
    const denied = await withContext(
      'user',
      { orgId: org.organizationId, userId: org.staff.owner.userId, role: 'OWNER' },
      (client) =>
        errorCode(
          client,
          `INSERT INTO tenancy.subscription_plan (id, code, name, max_active_patients, max_professionals, price_cents)
           VALUES ($1, 'TRAMO_COLADO', 'Colado', 9999, 99, 0)`,
          [uuid()],
        ),
    );
    expect(denied).toBe('42501');
  });
});

describe('RF-39 · RN-A03 · RN-A09 · el uso del cupo de cada organización', () => {
  it('pacientes y miembros activos, solo cuentas; la función no responde a otros roles', async () => {
    const response = await harness.get('/platform/organizations', platformCookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const mine = platformOrganizationListResponseSchema
      .parse(response.body)
      .organizations.find((o) => o.id === org.organizationId);
    expect(mine?.usage).toEqual({ activePatients: 2, activeProfessionals: 5 });
    expect(mine?.subscription?.maxActivePatients).toBeGreaterThan(0);
    const asOwner = await withContext(
      'user',
      { orgId: org.organizationId, userId: org.staff.owner.userId, role: 'OWNER' },
      async (client) =>
        (await client.query<{ organization_id: string }>('SELECT * FROM app.organization_usage()'))
          .rows,
    );
    expect(asOwner).toEqual([]);
  });
});

describe('RF-39 · banderas por organización (ADR-127)', () => {
  const flags = async () => {
    const response = await harness.get(
      `/platform/organizations/${org.organizationId}/flags`,
      platformCookie,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return platformFeatureFlagsResponseSchema.parse(response.body).flags;
  };

  it('de fábrica, las tres de la fase C encendidas', async () => {
    expect(await flags()).toEqual([
      { key: 'MESOCYCLE_REPORT', enabled: true, source: 'DEFAULT' },
      { key: 'PROGRESS_PHOTOS', enabled: true, source: 'DEFAULT' },
      { key: 'RECORD_DOCUMENTS', enabled: true, source: 'DEFAULT' },
    ]);
    const organization = await harness.get('/organization', org.staff.owner.cookie);
    expect(organizationResponseSchema.parse(organization.body).features.PROGRESS_PHOTOS).toBe(true);
  });

  it('apagar las fotos de progreso las saca de la API, del panel y de la app; encenderlas las devuelve', async () => {
    const off = await harness.put(
      `/platform/organizations/${org.organizationId}/flags/PROGRESS_PHOTOS`,
      { enabled: false },
      platformCookie,
    );
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(platformFeatureFlagsResponseSchema.parse(off.body).flags).toContainEqual({
      key: 'PROGRESS_PHOTOS',
      enabled: false,
      source: 'ORGANIZATION',
    });
    const photos = await harness.get(
      `/patients/${patientId}/progress-photos`,
      org.staff.responsible.cookie,
    );
    expect(photos.status).toBe(404);
    expect(photos.body).toMatchObject({ code: 'NC-PLT-014' });
    expect((await harness.get('/me/progress-photos', patientCookie)).status).toBe(404);
    const organization = await harness.get('/organization', org.staff.owner.cookie);
    expect(organizationResponseSchema.parse(organization.body).features).toEqual({
      MESOCYCLE_REPORT: true,
      PROGRESS_PHOTOS: false,
      RECORD_DOCUMENTS: true,
    });
    const app = await harness.get('/me/app', patientCookie);
    expect(meAppSchema.parse(app.body).features.PROGRESS_PHOTOS).toBe(false);
    // Las demás funciones siguen.
    expect(
      (await harness.get(`/patients/${patientId}/record-documents`, org.staff.responsible.cookie))
        .status,
    ).toBe(200);

    await harness.put(
      `/platform/organizations/${org.organizationId}/flags/PROGRESS_PHOTOS`,
      { enabled: true },
      platformCookie,
    );
    expect(
      (await harness.get(`/patients/${patientId}/progress-photos`, org.staff.responsible.cookie))
        .status,
    ).toBe(200);
  });

  it('una clave fuera del catálogo es 400; el equipo no escribe sus banderas ni en la base', async () => {
    const unknown = await harness.put(
      `/platform/organizations/${org.organizationId}/flags/COACH_VIRTUAL`,
      { enabled: true },
      platformCookie,
    );
    expect(unknown.status).toBe(400);
    const denied = await withContext(
      'user',
      { orgId: org.organizationId, userId: org.staff.owner.userId, role: 'OWNER' },
      (client) =>
        errorCode(
          client,
          `INSERT INTO platform.feature_flag (key, organization_id, enabled) VALUES ('RECORD_DOCUMENTS', $1, false)`,
          [org.organizationId],
        ),
    );
    expect(denied).toBe('42501');
  });

  it('RN-B03 · los cambios de planes y banderas quedan en la auditoría', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{
      action: string;
      resource_type: string;
      organization_id: string | null;
    }>(
      `SELECT action, resource_type, organization_id FROM audit.audit_log
       WHERE resource_type IN ('platform.feature_flag', 'tenancy.subscription_plan') AND occurred_at > now() - interval '1 hour'`,
    );
    expect(rows).toContainEqual({
      action: 'UPDATE',
      resource_type: 'platform.feature_flag',
      organization_id: org.organizationId,
    });
    expect(
      rows.some((r) => r.resource_type === 'tenancy.subscription_plan' && r.action === 'CREATE'),
    ).toBe(true);
  });
});
