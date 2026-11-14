import {
  accountResponseSchema,
  platformSupportGrantListResponseSchema,
  supportGrantListResponseSchema,
  supportGrantSchema,
  supportStaffResponseSchema,
} from '@nutricoach/contracts';
import { hash } from '@node-rs/argon2';
import type { Clock } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P15 · PR 4a · el soporte con permiso del dueño, contra PostgreSQL como app_user (RN-A09, RN-B03; ADR-124, ADR-129). Criterio 2 de
 * P15: el soporte sin permiso no abre un expediente; con permiso vigente sí, y queda auditado. Además: solo el dueño da y revoca, el
 * soporte solo lee y nunca se da un permiso, ACCOUNT no ve pacientes, y vencer o revocar corta el acceso en la petición siguiente.
 * Datos sintéticos.
 */

class FakeClock implements Clock {
  current = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  now(): Date {
    return new Date(this.current);
  }
}

const clock = new FakeClock();
const harness = new ApiHarness(clock);
const HOUR = 3_600_000;
let org: StaffOrganization;
let patientId: string;
let support: { userId: string; cookie: string };
let accountSupport: { userId: string; cookie: string };

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};
const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

async function platformPerson(name: string): Promise<{ userId: string; cookie: string }> {
  const userId = uuid();
  const email = `soporte-${uuid()}@demo.test`;
  await owner(
    `INSERT INTO iam.user_account (id, email, password_hash, display_name, status, is_platform_admin)
     VALUES ($1, $2, $3, $4, 'ACTIVE', true)`,
    [userId, email, await hash(PASSWORD), name],
  );
  const login = await harness.post('/auth/login', { email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { userId, cookie: sessionCookie(login) };
}

const grant = async (
  supportUserId: string,
  scope: 'ACCOUNT' | 'CLINICAL_READ',
  durationDays = 1,
) => {
  const response = await harness.post(
    '/organization/support-grants',
    { supportUserId, scope, reason: 'Revisar el error que reportó el equipo', durationDays },
    org.staff.owner.cookie,
  );
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return supportGrantSchema.parse(response.body);
};

const enter = (cookie: string) =>
  harness.post('/platform/support/session', { organizationId: org.organizationId }, cookie);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  support = await platformPerson('Ana de Soporte');
  accountSupport = await platformPerson('Beto de Soporte');
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Nora',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-05-20',
  });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('RN-A09 · el dueño da el permiso', () => {
  it('elige a quién de la lista del soporte, que muestra solo nombres; nadie más la ve', async () => {
    const listed = await harness.get('/organization/support-staff', org.staff.owner.cookie);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const { staff } = supportStaffResponseSchema.parse(listed.body);
    expect(staff).toContainEqual({ userId: support.userId, displayName: 'Ana de Soporte' });
    expect(staff.some((s) => s.userId === org.staff.owner.userId)).toBe(false);
    expect(Object.keys(staff[0] ?? {}).sort()).toEqual(['displayName', 'userId']);
    for (const key of ['admin', 'responsible'] as const) {
      const denied = await harness.get('/organization/support-staff', org.staff[key].cookie);
      expect(denied.status).toBe(403);
      const posted = await harness.post(
        '/organization/support-grants',
        { supportUserId: support.userId, scope: 'ACCOUNT', reason: 'Ayuda', durationDays: 1 },
        org.staff[key].cookie,
      );
      expect(posted.status).toBe(403);
    }
  });

  it('de 1 a 7 días, con motivo, y solo a alguien del soporte', async () => {
    const body = { supportUserId: support.userId, scope: 'ACCOUNT', reason: 'Revisar la marca' };
    for (const wrong of [
      { ...body, durationDays: 8 },
      { ...body, durationDays: 0 },
      { ...body, reason: 'ab' },
      { ...body, scope: 'TODO' },
    ]) {
      const response = await harness.post(
        '/organization/support-grants',
        wrong,
        org.staff.owner.cookie,
      );
      expect(response.status, JSON.stringify(wrong)).toBe(400);
    }
    const notSupport = await harness.post(
      '/organization/support-grants',
      { ...body, supportUserId: org.staff.admin.userId },
      org.staff.owner.cookie,
    );
    expect(notSupport.status).toBe(422);
    expect(notSupport.body).toMatchObject({ code: 'NC-TEN-047', rule: 'RN-A09' });
  });
});

describe('Criterio 2 de P15 · el soporte sin permiso no abre un expediente; con permiso vigente sí, y queda auditado', () => {
  it('sin permiso no entra a la organización ni lee nada de ella', async () => {
    const denied = await enter(support.cookie);
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: 'NC-IAM-051', rule: 'RN-A09' });
    const patients = await harness.get('/patients', support.cookie);
    expect(patients.status).toBe(403);
    const record = await harness.get(`/patients/${patientId}`, support.cookie);
    expect(record.status).toBe(403);
  });

  it('con CLINICAL_READ vigente entra, lee la lista y el expediente, y no escribe', async () => {
    const created = await grant(support.userId, 'CLINICAL_READ');
    expect(created).toMatchObject({
      supportName: 'Ana de Soporte',
      scope: 'CLINICAL_READ',
      status: 'ACTIVE',
      revokedAt: null,
      grantedBy: org.staff.owner.userId,
    });
    expect(Date.parse(created.expiresAt) - Date.parse(created.createdAt)).toBe(24 * HOUR);

    const mine = await harness.get('/platform/support/grants', support.cookie);
    expect(
      platformSupportGrantListResponseSchema.parse(mine.body).grants.map((g) => g.organizationId),
    ).toContain(org.organizationId);

    const entered = await enter(support.cookie);
    expect(entered.status, JSON.stringify(entered.body)).toBe(200);
    expect(accountResponseSchema.parse(entered.body).support).toMatchObject({
      grantId: created.id,
      organizationId: org.organizationId,
      scope: 'CLINICAL_READ',
    });
    const account = await harness.get('/account', support.cookie);
    expect(accountResponseSchema.parse(account.body).support?.grantId).toBe(created.id);

    const patients = await harness.get('/patients', support.cookie);
    expect(patients.status, JSON.stringify(patients.body)).toBe(200);
    expect(JSON.stringify(patients.body)).toContain(patientId);
    const record = await harness.get(`/patients/${patientId}`, support.cookie);
    expect(record.status, JSON.stringify(record.body)).toBe(200);
    const history = await harness.get(`/patients/${patientId}/timeline`, support.cookie);
    expect(history.status, JSON.stringify(history.body)).toBe(200);

    const write = await harness.post(
      '/patients',
      { firstName: 'Otra', lastName: 'Sintética', sex: 'F', birthDate: '1990-01-01' },
      support.cookie,
    );
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({ code: 'NC-TEN-017', rule: 'RN-A09' });
    for (const path of ['/organization/support-grants', '/audit-events']) {
      const denied = await harness.get(path, support.cookie);
      expect(denied.status, path).toBe(403);
    }
  });

  it('la auditoría guarda el permiso con que entró y cada lectura, con el paciente', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{
      action: string;
      resource_type: string;
      patient_id: string | null;
      actor_user_id: string | null;
      actor_role: string;
    }>(
      `SELECT action, resource_type, patient_id, actor_user_id, actor_role FROM audit.audit_log
       WHERE organization_id = $1 AND support_grant_id IS NOT NULL ORDER BY occurred_at, id`,
      [org.organizationId],
    );
    const bySupport = { actor_user_id: support.userId, actor_role: 'PLATFORM_ADMIN' };
    expect(rows).toContainEqual({
      action: 'LOGIN',
      resource_type: 'support.session',
      patient_id: null,
      ...bySupport,
    });
    expect(rows).toContainEqual({
      action: 'READ',
      resource_type: 'support:/patients',
      patient_id: null,
      ...bySupport,
    });
    expect(rows).toContainEqual({
      action: 'READ',
      resource_type: 'support:/patients/:patientId',
      patient_id: patientId,
      ...bySupport,
    });
    const granted = await owner<{ action: string; actor_user_id: string }>(
      `SELECT action, actor_user_id FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'tenancy.support_access_grant'`,
      [org.organizationId],
    );
    expect(granted).toContainEqual({ action: 'GRANT', actor_user_id: org.staff.owner.userId });
  });
});

describe('RN-A09 · el alcance, la caducidad y la revocación', () => {
  it('ACCOUNT ve el equipo y los ajustes, pero no los pacientes ni la agenda', async () => {
    await grant(accountSupport.userId, 'ACCOUNT');
    expect((await enter(accountSupport.cookie)).status).toBe(200);
    for (const path of ['/organization', '/organization/members', '/organization/settings']) {
      const allowed = await harness.get(path, accountSupport.cookie);
      expect(allowed.status, `${path} ${JSON.stringify(allowed.body)}`).toBe(200);
    }
    for (const path of ['/patients', `/patients/${patientId}`, '/appointments']) {
      const denied = await harness.get(path, accountSupport.cookie);
      expect(denied.status, path).toBe(403);
      expect(denied.body).toMatchObject({ code: 'NC-TEN-015', rule: 'RN-A09' });
    }
  });

  it('el dueño ve sus permisos; uno nuevo para la misma persona y el mismo alcance reemplaza al vigente', async () => {
    const replacement = await grant(support.userId, 'CLINICAL_READ', 3);
    const listed = await harness.get('/organization/support-grants', org.staff.owner.cookie);
    const { grants } = supportGrantListResponseSchema.parse(listed.body);
    const clinical = grants.filter(
      (g) => g.supportUserId === support.userId && g.scope === 'CLINICAL_READ',
    );
    expect(clinical.map((g) => g.status)).toEqual(['ACTIVE', 'REVOKED']);
    expect(clinical[0]?.id).toBe(replacement.id);
    expect(grants[0]?.status).toBe('ACTIVE');
  });

  it('revocado: corta el acceso en la petición siguiente, y no se revoca dos veces', async () => {
    const listed = await harness.get('/organization/support-grants', org.staff.owner.cookie);
    const active = supportGrantListResponseSchema
      .parse(listed.body)
      .grants.find(
        (g) =>
          g.supportUserId === support.userId &&
          g.scope === 'CLINICAL_READ' &&
          g.status === 'ACTIVE',
      );
    expect(active).toBeDefined();
    const revoked = await harness.post(
      `/organization/support-grants/${active?.id ?? ''}/revoke`,
      undefined,
      org.staff.owner.cookie,
    );
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(204);
    const cut = await harness.get('/patients', support.cookie);
    expect(cut.status).toBe(403);
    expect(cut.body).toMatchObject({ code: 'NC-TEN-016', rule: 'RN-A09' });
    const account = await harness.get('/account', support.cookie);
    expect(accountResponseSchema.parse(account.body).support).toBeNull();
    const again = await harness.post(
      `/organization/support-grants/${active?.id ?? ''}/revoke`,
      undefined,
      org.staff.owner.cookie,
    );
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'NC-TEN-049' });
    const unknown = await harness.post(
      `/organization/support-grants/${uuid()}/revoke`,
      undefined,
      org.staff.owner.cookie,
    );
    expect(unknown.status).toBe(404);
  });

  it('vencido: caduca solo a su hora, sin que nadie lo revoque; salir del modo soporte siempre funciona', async () => {
    const current = await grant(support.userId, 'CLINICAL_READ', 1);
    expect((await enter(support.cookie)).status).toBe(200);
    expect((await harness.get('/patients', support.cookie)).status).toBe(200);
    // Su hora de vencimiento ya pasó (en la base: adelantar el reloj de la API 24 horas también vencería la sesión, RN-A08).
    await owner(
      `UPDATE tenancy.support_access_grant SET created_at = $2, expires_at = $3 WHERE id = $1`,
      [
        current.id,
        new Date(clock.current.getTime() - 2 * HOUR),
        new Date(clock.current.getTime() - 1_000),
      ],
    );
    const expired = await harness.get(`/patients/${patientId}`, support.cookie);
    expect(expired.status).toBe(403);
    expect(expired.body).toMatchObject({ code: 'NC-TEN-016' });
    const listed = await harness.get('/organization/support-grants', org.staff.owner.cookie);
    expect(
      supportGrantListResponseSchema.parse(listed.body).grants.find((g) => g.id === current.id)
        ?.status,
    ).toBe('EXPIRED');
    const left = await harness.delete('/platform/support/session', support.cookie);
    expect(left.status, JSON.stringify(left.body)).toBe(200);
    expect(accountResponseSchema.parse(left.body)).toMatchObject({
      activeOrganizationId: null,
      support: null,
    });
  });
});

describe('RN-A09 · la base: solo el dueño da y revoca, y el soporte nunca se da un permiso', () => {
  const insert = `INSERT INTO tenancy.support_access_grant
                    (id, organization_id, support_user_id, scope, reason, granted_by, created_at, expires_at)
                  VALUES ($1, $2, $3, 'CLINICAL_READ', 'Me lo doy', $4, now(), now() + interval '1 day')`;

  it('el soporte no se da uno ni revoca; un administrador tampoco; solo lee los suyos', async () => {
    await withContext(
      'user',
      { orgId: org.organizationId, userId: support.userId, role: 'PLATFORM_ADMIN' },
      async (client) => {
        expect(
          await errorCode(client, insert, [
            uuid(),
            org.organizationId,
            support.userId,
            support.userId,
          ]),
        ).toBe(PG.insufficientPrivilege);
        const own = await client.query<{ support_user_id: string }>(
          'SELECT support_user_id FROM tenancy.support_access_grant',
        );
        expect(own.rows.length).toBeGreaterThan(0);
        expect(new Set(own.rows.map((r) => r.support_user_id))).toEqual(new Set([support.userId]));
        await client.query('UPDATE tenancy.support_access_grant SET revoked_at = now()');
        const still = await client.query(
          'SELECT 1 FROM tenancy.support_access_grant WHERE revoked_at IS NULL',
        );
        expect(still.rows.length).toBeGreaterThan(0);
      },
    );
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        userId: org.staff.admin.userId,
        role: 'ADMIN',
        memberId: org.staff.admin.memberId,
      },
      async (client) => {
        expect(
          await errorCode(client, insert, [
            uuid(),
            org.organizationId,
            support.userId,
            org.staff.admin.userId,
          ]),
        ).toBe(PG.insufficientPrivilege);
        expect((await client.query('SELECT 1 FROM tenancy.support_access_grant')).rows).toEqual([]);
      },
    );
  });

  it('el dueño da uno solo a alguien del soporte, de hasta 7 días, y solo cambia revoked_at', async () => {
    const ownerContext = {
      orgId: org.organizationId,
      userId: org.staff.owner.userId,
      role: 'OWNER' as const,
      memberId: org.staff.owner.memberId,
    };
    await withContext('user', ownerContext, async (client) => {
      expect(
        await errorCode(client, insert, [
          uuid(),
          org.organizationId,
          org.staff.admin.userId,
          org.staff.owner.userId,
        ]),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO tenancy.support_access_grant
             (id, organization_id, support_user_id, scope, reason, granted_by, created_at, expires_at)
           VALUES ($1, $2, $3, 'ACCOUNT', 'Una semana y un poco', $4, now(), now() + interval '8 days')`,
          [uuid(), org.organizationId, support.userId, org.staff.owner.userId],
        ),
      ).toBe('23514');
      expect(
        await errorCode(client, `UPDATE tenancy.support_access_grant SET reason = 'Otro motivo'`),
      ).toBe(PG.insufficientPrivilege);
      expect(await errorCode(client, 'DELETE FROM tenancy.support_access_grant')).toBe(
        PG.insufficientPrivilege,
      );
    });
  });

  it('las tablas de un paciente que faltaban: el soporte sin permiso no las ve y con permiso no las escribe', async () => {
    const tables = [
      'scheduling.appointment',
      'content.resource_assignment',
      'content.motivational_message',
      'content.patient_app_setting',
      'assessment.method_preference',
    ];
    const policies = await owner<{ table: string }>(
      `SELECT schemaname || '.' || tablename AS table FROM pg_policies
       WHERE policyname = 'support_read_only' AND schemaname || '.' || tablename = ANY($1)`,
      [tables],
    );
    expect(policies.map((p) => p.table).sort()).toEqual([...tables].sort());
  });
});
