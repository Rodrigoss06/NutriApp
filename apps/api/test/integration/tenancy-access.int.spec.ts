import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import {
  configureHttp,
  ConsumerRegistry,
  ConsumerRunner,
  JobRegistry,
  MAILER,
  type EventConsumer,
  type MailMessage,
  type OutboxEnvelope,
} from '../../src/platform/index.js';
import { id, pool } from './support/database.js';

/**
 * P5 de punta a punta contra PostgreSQL como app_user: alta por plataforma, invitaciones de un solo uso, cupos
 * con candado (RN-A03), «al menos un dueño» (RN-A04), solo lectura al vencer (RN-A02) y aislamiento (RN-A01).
 */

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'un-cielo-gris-sobre-lima';

class FakeClock implements Clock {
  current = new Date();
  now(): Date {
    return new Date(this.current);
  }
}

const clock = new FakeClock();
const sent: MailMessage[] = [];
let app: INestApplication<App>;
let runner: ConsumerRunner;
let mailConsumer: EventConsumer;
let auditConsumer: EventConsumer;

const http = () => request(app.getHttpServer());
const withCookie = (req: request.Test, cookie?: string) =>
  cookie ? req.set('Cookie', cookie) : req;
const post = (path: string, body: object, cookie?: string) =>
  withCookie(http().post(`/api/v1${path}`).set('Origin', ORIGIN).send(body), cookie);
const patch = (path: string, body: object, cookie?: string) =>
  withCookie(http().patch(`/api/v1${path}`).set('Origin', ORIGIN).send(body), cookie);
const put = (path: string, body: object, cookie?: string) =>
  withCookie(http().put(`/api/v1${path}`).set('Origin', ORIGIN).send(body), cookie);
const del = (path: string, cookie?: string) =>
  withCookie(http().delete(`/api/v1${path}`).set('Origin', ORIGIN), cookie);
const get = (path: string, cookie?: string) => withCookie(http().get(`/api/v1${path}`), cookie);

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

/** Lo que las pruebas leen de las respuestas JSON. */
interface Body {
  id?: string;
  code?: string;
  rule?: string;
  status?: string;
  accountExists?: boolean;
  activeOrganizationId?: string | null;
  invitations?: unknown[];
  members?: { email: string | null }[];
}
const bodyOf = (response: request.Response | undefined): Body => (response?.body ?? {}) as Body;

const uniqueEmail = (label: string) => `${label}-${id()}@demo.test`;

async function createAccount(
  options: { isPlatformAdmin?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const userId = id();
  const email = uniqueEmail('cuenta');
  await pool('owner').query(
    `INSERT INTO iam.user_account (id, email, password_hash, display_name, status, is_platform_admin)
     VALUES ($1, $2, $3, 'Persona de prueba', 'ACTIVE', $4)`,
    [userId, email, await hash(PASSWORD), options.isPlatformAdmin ?? false],
  );
  return { id: userId, email };
}

async function loginAs(email: string): Promise<string> {
  const response = await post('/auth/login', { email, password: PASSWORD });
  expect(response.status).toBe(200);
  return sessionCookie(response);
}

/** Entrega los eventos pendientes del outbox a un consumidor, como el worker (contexto SYSTEM del evento). */
async function deliver(consumer: EventConsumer): Promise<void> {
  const { rows } = await pool('owner').query<{
    id: string;
    organization_id: string | null;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: unknown;
    metadata: OutboxEnvelope['metadata'];
    occurred_at: Date;
  }>(
    `SELECT id, organization_id, aggregate_type, aggregate_id, event_type, payload, metadata, occurred_at
     FROM platform.outbox_event WHERE event_type = ANY($1) ORDER BY id`,
    [consumer.eventTypes],
  );
  for (const row of rows) {
    await runner.process(consumer, {
      eventId: row.id,
      type: row.event_type,
      version: 1,
      occurredAt: row.occurred_at.toISOString(),
      organizationId: row.organization_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: row.payload,
      metadata: row.metadata,
    });
  }
}

/** El token del último correo de invitación a ese correo: el E2E lo leerá de Mailpit; aquí, del mailer falso. */
async function invitationTokenFor(email: string): Promise<string> {
  await deliver(mailConsumer);
  const message = sent.filter((m) => m.to === email).at(-1);
  const token = /\/invitacion#([\w-]+)/.exec(message?.text ?? '')?.[1];
  if (!token) throw new Error(`Sin correo de invitación para ${email}`);
  return token;
}

let platformCookie: string;

async function createPlan(maxProfessionals: number): Promise<string> {
  const code = `PRUEBA_${id().slice(-12).toUpperCase()}`;
  await pool('owner').query(
    `INSERT INTO tenancy.subscription_plan (id, code, name, max_active_patients, max_professionals, price_cents)
     VALUES ($1, $2, 'Plan de prueba', 5, $3, 0)`,
    [id(), code, maxProfessionals],
  );
  return code;
}

/** Alta por plataforma y aceptación del dueño: devuelve la organización y la cookie del dueño. */
async function createOrganization(
  maxProfessionals = 3,
  startsOn = new Date().toISOString().slice(0, 10),
): Promise<{ organizationId: string; ownerCookie: string; ownerEmail: string }> {
  const ownerEmail = uniqueEmail('duena');
  const created = await post(
    '/platform/organizations',
    {
      name: 'Consultorio de prueba',
      slug: `org-${id().slice(-12)}`,
      planCode: await createPlan(maxProfessionals),
      startsOn,
      ownerEmail,
    },
    platformCookie,
  );
  expect(created.status).toBe(201);
  const accepted = await post('/invitations/accept', {
    token: await invitationTokenFor(ownerEmail),
    password: PASSWORD,
    displayName: 'Dueña de prueba',
  });
  expect(accepted.status).toBe(200);
  return {
    organizationId: bodyOf(created).id as string,
    ownerCookie: sessionCookie(accepted),
    ownerEmail,
  };
}

async function inviteAndAccept(ownerCookie: string, role = 'PROFESSIONAL') {
  const email = uniqueEmail('profesional');
  expect((await post('/organization/invitations', { email, role }, ownerCookie)).status).toBe(201);
  const token = await invitationTokenFor(email);
  const accepted = await post('/invitations/accept', {
    token,
    password: PASSWORD,
    displayName: 'Profesional',
  });
  expect(accepted.status).toBe(200);
  return { email, cookie: sessionCookie(accepted), userId: bodyOf(accepted).id as string };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MAILER)
    .useValue({ send: (message: MailMessage) => Promise.resolve(void sent.push(message)) })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();
  runner = moduleRef.get(ConsumerRunner);
  const consumers = moduleRef.get(ConsumerRegistry).all();
  const consumerNamed = (name: string): EventConsumer => {
    const consumer = consumers.find((c) => c.name === name);
    if (!consumer) throw new Error(`Falta el consumidor ${name}`);
    return consumer;
  };
  mailConsumer = consumerNamed('iam.mailer');
  auditConsumer = consumerNamed('audit.events');
  const admin = await createAccount({ isPlatformAdmin: true });
  platformCookie = await loginAs(admin.email);
});

beforeEach(() => {
  clock.current = new Date();
});

afterAll(async () => {
  await app.close();
});

describe('RF-01 · invitación de un solo uso', () => {
  it('el dueño invita, el profesional fija su contraseña y entra; el enlace no funciona dos veces', async () => {
    const { organizationId, ownerCookie } = await createOrganization();
    const email = uniqueEmail('profesional');
    expect(
      (await post('/organization/invitations', { email, role: 'PROFESSIONAL' }, ownerCookie))
        .status,
    ).toBe(201);
    const token = await invitationTokenFor(email);

    const inspected = await post('/invitations/inspect', { token });
    expect(inspected.status).toBe(200);
    expect(inspected.headers['cache-control']).toBe('no-store');
    expect(inspected.body).toMatchObject({ email, role: 'PROFESSIONAL', accountExists: false });

    const accepted = await post('/invitations/accept', {
      token,
      password: PASSWORD,
      displayName: 'Profe',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ kind: 'STAFF', activeOrganizationId: organizationId });
    expect((await get('/organization', sessionCookie(accepted))).status).toBe(200);
    expect((await post('/auth/login', { email, password: PASSWORD })).status).toBe(200);

    const again = await post('/invitations/accept', {
      token,
      password: PASSWORD,
      displayName: 'Profe',
    });
    expect(again.status).toBe(410);
    expect(bodyOf(again).code).toBe('NC-IAM-040');
  });

  it('dos aceptaciones simultáneas del mismo enlace: una entra y la otra recibe 410', async () => {
    const { ownerCookie } = await createOrganization();
    const email = uniqueEmail('profesional');
    await post('/organization/invitations', { email, role: 'PROFESSIONAL' }, ownerCookie);
    const token = await invitationTokenFor(email);
    const body = { token, password: PASSWORD, displayName: 'Profe' };
    const statuses = (
      await Promise.all([post('/invitations/accept', body), post('/invitations/accept', body)])
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 410]);
  });

  it('con una cuenta ACTIVE del correo invitado se acepta con su contraseña actual; otra contraseña, 401', async () => {
    const { organizationId, ownerCookie } = await createOrganization();
    const existing = await createAccount();
    await post('/organization/invitations', { email: existing.email, role: 'ADMIN' }, ownerCookie);
    const token = await invitationTokenFor(existing.email);
    expect(bodyOf(await post('/invitations/inspect', { token })).accountExists).toBe(true);
    expect(
      (await post('/invitations/accept', { token, password: 'otra-clave-cualquiera' })).status,
    ).toBe(401);
    const accepted = await post('/invitations/accept', { token, password: PASSWORD });
    expect(accepted.status).toBe(200);
    expect(bodyOf(accepted).id).toBe(existing.id);
    expect(bodyOf(accepted).activeOrganizationId).toBe(organizationId);
  });

  it('reenviar revoca la anterior; invitar a un miembro activo es 409; solo OWNER invita OWNER', async () => {
    const { ownerCookie } = await createOrganization();
    const email = uniqueEmail('profesional');
    const first = await post(
      '/organization/invitations',
      { email, role: 'PROFESSIONAL' },
      ownerCookie,
    );
    const oldToken = await invitationTokenFor(email);
    const resent = await post(
      `/organization/invitations/${bodyOf(first).id as string}/resend`,
      {},
      ownerCookie,
    );
    expect(resent.status).toBe(201);
    const newToken = await invitationTokenFor(email);
    expect(newToken).not.toBe(oldToken);
    expect((await post('/invitations/inspect', { token: oldToken })).status).toBe(410);
    const list = await get('/organization/invitations', ownerCookie);
    expect(bodyOf(list).invitations).toHaveLength(1);

    const member = await post('/invitations/accept', {
      token: newToken,
      password: PASSWORD,
      displayName: 'P',
    });
    expect(
      (await post('/organization/invitations', { email, role: 'PROFESSIONAL' }, ownerCookie))
        .status,
    ).toBe(409);

    // Un ADMIN no invita dueños (RN-A04).
    const admin = await inviteAndAccept(ownerCookie, 'ADMIN');
    const asAdmin = await post(
      '/organization/invitations',
      { email: uniqueEmail('x'), role: 'OWNER' },
      admin.cookie,
    );
    expect(asAdmin.status).toBe(422);
    expect(bodyOf(asAdmin).rule).toBe('RN-A04');
    expect(member.status).toBe(200);
  });
});

describe('RN-A03 · cupo de staff', () => {
  it('invitar cuenta los miembros activos y las invitaciones vigentes: superar el cupo es 422', async () => {
    const { ownerCookie } = await createOrganization(2);
    expect(
      (
        await post(
          '/organization/invitations',
          { email: uniqueEmail('a'), role: 'PROFESSIONAL' },
          ownerCookie,
        )
      ).status,
    ).toBe(201);
    const over = await post(
      '/organization/invitations',
      { email: uniqueEmail('b'), role: 'PROFESSIONAL' },
      ownerCookie,
    );
    expect(over.status).toBe(422);
    expect(over.body).toMatchObject({ rule: 'RN-A03', code: 'NC-TEN-001' });
  });

  it('dos altas a la vez con un solo cupo libre: entra una y la otra recibe 422', async () => {
    const { organizationId, ownerCookie } = await createOrganization(3);
    const a = uniqueEmail('a');
    const b = uniqueEmail('b');
    await post('/organization/invitations', { email: a, role: 'PROFESSIONAL' }, ownerCookie);
    await post('/organization/invitations', { email: b, role: 'PROFESSIONAL' }, ownerCookie);
    const [tokenA, tokenB] = [await invitationTokenFor(a), await invitationTokenFor(b)];
    // Ocupa un cupo por fuera: queda uno libre para las dos aceptaciones.
    const extra = await createAccount();
    await pool('owner').query(
      `INSERT INTO tenancy.member (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, 'PROFESSIONAL', 'ACTIVE')`,
      [id(), organizationId, extra.id],
    );
    const responses = await Promise.all([
      post('/invitations/accept', { token: tokenA, password: PASSWORD, displayName: 'A' }),
      post('/invitations/accept', { token: tokenB, password: PASSWORD, displayName: 'B' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(bodyOf(responses.find((r) => r.status === 422)).rule).toBe('RN-A03');
    const { rows } = await pool('owner').query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tenancy.member WHERE organization_id = $1 AND status = 'ACTIVE'`,
      [organizationId],
    );
    expect(rows[0]?.n).toBe(3);
    // La invitación rechazada sigue pendiente: la transacción se revirtió entera.
    const pending = await pool('owner').query(
      `SELECT 1 FROM iam.invitation WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [organizationId],
    );
    expect(pending.rowCount).toBe(1);
  });
});

describe('RN-A04 · al menos un dueño', () => {
  it('dos dueños que se quitan el rol a la vez: uno pasa y el otro recibe 422', async () => {
    const { organizationId, ownerCookie } = await createOrganization(4);
    const second = await inviteAndAccept(ownerCookie, 'OWNER');
    const { rows } = await pool('owner').query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM tenancy.member WHERE organization_id = $1 AND role = 'OWNER'`,
      [organizationId],
    );
    const firstMember = rows.find((r) => r.user_id !== second.userId);
    const secondMember = rows.find((r) => r.user_id === second.userId);
    const responses = await Promise.all([
      patch(`/organization/members/${secondMember?.id ?? ''}`, { role: 'ADMIN' }, ownerCookie),
      patch(`/organization/members/${firstMember?.id ?? ''}`, { role: 'ADMIN' }, second.cookie),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 422]);
    const owners = await pool('owner').query(
      `SELECT 1 FROM tenancy.member WHERE organization_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'`,
      [organizationId],
    );
    expect(owners.rowCount).toBe(1);
  });

  it('un PROFESSIONAL ve los miembros sin correos y no ve invitaciones', async () => {
    const { ownerCookie } = await createOrganization();
    const professional = await inviteAndAccept(ownerCookie);
    const members = await get('/organization/members', professional.cookie);
    expect(members.status).toBe(200);
    expect(
      (bodyOf(members).members ?? []).every((m: { email: string | null }) => m.email === null),
    ).toBe(true);
    expect((await get('/organization/invitations', professional.cookie)).status).toBe(403);
    const asOwner = await get('/organization/members', ownerCookie);
    expect(
      (bodyOf(asOwner).members ?? []).some(
        (m: { email: string | null }) => m.email === professional.email,
      ),
    ).toBe(true);
  });
});

describe('RN-A01 · aislamiento entre organizaciones', () => {
  it('un profesional de A no ve nada de B ni puede cambiarse a B', async () => {
    const a = await createOrganization();
    const b = await createOrganization();
    const professional = await inviteAndAccept(a.ownerCookie);
    const members = await get('/organization/members', professional.cookie);
    expect(bodyOf(members).members).toHaveLength(2);
    const { rows } = await pool('owner').query<{ id: string }>(
      `SELECT id FROM tenancy.member WHERE organization_id = $1 LIMIT 1`,
      [b.organizationId],
    );
    const foreign = await patch(
      `/organization/members/${rows[0]?.id ?? ''}`,
      { status: 'SUSPENDED' },
      a.ownerCookie,
    );
    expect(foreign.status).toBe(404);
    const switched = await post(
      '/session/active-organization',
      { organizationId: b.organizationId },
      professional.cookie,
    );
    expect(switched.status).toBe(404);
  });

  it('con dos membresías no se fija organización al entrar; se elige y cambia de contexto', async () => {
    const a = await createOrganization();
    const b = await createOrganization();
    const professional = await inviteAndAccept(a.ownerCookie);
    await post(
      '/organization/invitations',
      { email: professional.email, role: 'PROFESSIONAL' },
      b.ownerCookie,
    );
    await post('/invitations/accept', {
      token: await invitationTokenFor(professional.email),
      password: PASSWORD,
    });

    const login = await post('/auth/login', { email: professional.email, password: PASSWORD });
    expect(bodyOf(login).activeOrganizationId).toBeNull();
    const cookie = sessionCookie(login);
    expect((await get('/organization', cookie)).status).toBe(403);
    const switched = await post(
      '/session/active-organization',
      { organizationId: b.organizationId },
      cookie,
    );
    expect(switched.status).toBe(200);
    expect(bodyOf(await get('/organization', cookie)).id).toBe(b.organizationId);
  });
});

describe('RN-A02 · solo lectura al vencer y renovación', () => {
  it('vence por la fecha local después de la gracia, bloquea escrituras y la renovación la reactiva', async () => {
    const { organizationId, ownerCookie } = await createOrganization(3, '2025-01-01');
    const job = app
      .get(JobRegistry)
      .all()
      .find((j) => j.queue === 'tenancy.expire-subscriptions');
    if (!job) throw new Error('Falta el trabajo de RN-A02');

    // Plan de 12 meses: vale hasta 2025-12-31; con 7 días de gracia (por defecto), solo lectura desde 2026-01-08.
    clock.current = new Date('2026-01-07T23:00:00-05:00');
    await job.run();
    expect(bodyOf(await get('/organization', ownerCookie)).status).toBe('ACTIVE');

    clock.current = new Date('2026-01-08T00:30:00-05:00');
    // Idempotente: correrlo dos veces no cambia nada más.
    await job.run();
    await job.run();
    const organization = await get('/organization', ownerCookie);
    expect(bodyOf(organization).status).toBe('READ_ONLY');
    const blocked = await post(
      '/organization/invitations',
      { email: uniqueEmail('x'), role: 'PROFESSIONAL' },
      ownerCookie,
    );
    expect(blocked.status).toBe(422);
    expect(bodyOf(blocked).rule).toBe('RN-A02');

    const renewed = await post(
      `/platform/organizations/${organizationId}/subscriptions`,
      { planCode: await createPlan(3), startsOn: '2026-01-08', reason: 'Renovación' },
      platformCookie,
    );
    expect(renewed.status).toBe(204);
    expect(bodyOf(await get('/organization', ownerCookie)).status).toBe('ACTIVE');
    const { rows } = await pool('owner').query<{ status: string }>(
      `SELECT status FROM tenancy.subscription WHERE organization_id = $1 ORDER BY created_at`,
      [organizationId],
    );
    expect(rows.map((r) => r.status)).toEqual(['EXPIRED', 'ACTIVE']);
  });

  it('las rutas de plataforma rechazan sesiones STAFF y las de organización rechazan PLATFORM', async () => {
    const { ownerCookie } = await createOrganization();
    expect((await get('/platform/organizations', ownerCookie)).status).toBe(403);
    expect((await get('/organization', platformCookie)).status).toBe(403);
  });
});

describe('02 §10 · auditoría desde los eventos', () => {
  it('el alta de un miembro queda auditada con su actor y su organización', async () => {
    const { organizationId, ownerCookie } = await createOrganization();
    const professional = await inviteAndAccept(ownerCookie);
    await deliver(auditConsumer);
    const { rows } = await pool('owner').query<{ action: string; actor_user_id: string }>(
      `SELECT action, actor_user_id FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'tenancy.member'`,
      [organizationId],
    );
    expect(rows.some((r) => r.action === 'GRANT' && r.actor_user_id === professional.userId)).toBe(
      true,
    );
  });
});

describe('RF-02 y RF-03 · organización, suscripción y ajustes por HTTP', () => {
  it('editar con If-Match: sin versión 428, versión vieja 409, correcta 200 con la versión nueva', async () => {
    const { ownerCookie } = await createOrganization();
    const current = await get('/organization', ownerCookie);
    const version = (current.body as { version: number }).version;
    expect((await patch('/organization', { name: 'Nombre nuevo' }, ownerCookie)).status).toBe(428);
    const updated = await patch('/organization', { name: 'Nombre nuevo' }, ownerCookie).set(
      'If-Match',
      `"${String(version)}"`,
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Nombre nuevo', version: version + 1 });
    const stale = await patch('/organization', { name: 'Otro' }, ownerCookie).set(
      'If-Match',
      String(version),
    );
    expect(stale.status).toBe(409);
  });

  it('suscripción con uso del cupo; ajustes de la organización y de plataforma', async () => {
    const { ownerCookie } = await createOrganization(3, '2026-01-01');
    await post(
      '/organization/invitations',
      { email: uniqueEmail('p'), role: 'PROFESSIONAL' },
      ownerCookie,
    );
    const subscription = await get('/organization/subscription', ownerCookie);
    expect(subscription.status).toBe(200);
    expect(subscription.body).toMatchObject({
      graceDays: 7,
      readOnlyFrom: '2027-01-08',
      usage: { staff: 1, pendingInvitations: 1, activePatients: 0 },
    });
    expect(
      (await put('/organization/settings/invitation.ttl_days', { value: 10 }, ownerCookie)).body,
    ).toEqual({
      'invitation.ttl_days': 10,
      'subscription.grace_days': 7,
    });
    const grace = await put(
      '/organization/settings/subscription.grace_days',
      { value: 1 },
      ownerCookie,
    );
    expect(grace.status).toBe(422);
    expect(bodyOf(grace).code).toBe('NC-TEN-031');
  });

  it('quitar a un miembro: 204, desaparece de la lista y pierde el acceso en la petición siguiente', async () => {
    const { organizationId, ownerCookie } = await createOrganization();
    const professional = await inviteAndAccept(ownerCookie);
    const { rows } = await pool('owner').query<{ id: string }>(
      `SELECT id FROM tenancy.member WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, professional.userId],
    );
    expect((await del(`/organization/members/${rows[0]?.id ?? ''}`, ownerCookie)).status).toBe(204);
    expect(bodyOf(await get('/organization/members', ownerCookie)).members).toHaveLength(1);
    expect((await get('/organization', professional.cookie)).status).toBe(403);
    expect((await del(`/organization/members/${rows[0]?.id ?? ''}`, ownerCookie)).status).toBe(404);
  });
});

describe('RF-39 · panel de plataforma por HTTP', () => {
  it('lista planes y organizaciones; errores de alta, gracia y organización inexistente', async () => {
    const { organizationId } = await createOrganization();
    expect(bodyOf(await get('/platform/plans', platformCookie))).toBeDefined();
    const plans = await get('/platform/plans', platformCookie);
    expect((plans.body as { plans: unknown[] }).plans.length).toBeGreaterThan(0);
    const organizations = await get('/platform/organizations', platformCookie);
    expect(
      (organizations.body as { organizations: { id: string }[] }).organizations.some(
        (o) => o.id === organizationId,
      ),
    ).toBe(true);

    const base = {
      name: 'Otra',
      planCode: 'NO_EXISTE',
      startsOn: '2026-10-07',
      ownerEmail: uniqueEmail('d'),
    };
    const noPlan = await post(
      '/platform/organizations',
      { ...base, slug: `org-${id().slice(-12)}` },
      platformCookie,
    );
    expect(noPlan.status).toBe(422);
    const slug = `org-${id().slice(-12)}`;
    const planCode = await createPlan(2);
    expect(
      (await post('/platform/organizations', { ...base, slug, planCode }, platformCookie)).status,
    ).toBe(201);
    expect(
      (await post('/platform/organizations', { ...base, slug, planCode }, platformCookie)).status,
    ).toBe(409);

    expect(
      (
        await put(
          `/platform/organizations/${organizationId}/grace-days`,
          { value: 0 },
          platformCookie,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await put(
          `/platform/organizations/${organizationId}/grace-days`,
          { value: 99 },
          platformCookie,
        )
      ).status,
    ).toBe(400);
    const missing = id();
    expect(
      (await put(`/platform/organizations/${missing}/grace-days`, { value: 1 }, platformCookie))
        .status,
    ).toBe(404);
    const renewMissing = await post(
      `/platform/organizations/${missing}/subscriptions`,
      { planCode, startsOn: '2026-10-07' },
      platformCookie,
    );
    expect(renewMissing.status).toBe(404);
  });
});

describe('Perfil profesional propio por HTTP', () => {
  it('el profesional lee y edita su perfil; textos vacíos quedan en null', async () => {
    const { ownerCookie } = await createOrganization();
    const professional = await inviteAndAccept(ownerCookie);
    const empty = await get('/organization/profile', professional.cookie);
    expect(empty.body).toMatchObject({
      role: 'PROFESSIONAL',
      profession: null,
      licenseNumber: null,
    });
    const updated = await put(
      '/organization/profile',
      { profession: 'TRAINER', licenseNumber: ' ', title: 'Entrenador' },
      professional.cookie,
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      profession: 'TRAINER',
      licenseNumber: null,
      title: 'Entrenador',
    });
    expect((await get('/organization/profile', platformCookie)).status).toBe(403);
  });
});
