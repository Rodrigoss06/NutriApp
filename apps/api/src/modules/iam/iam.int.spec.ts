import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { id, pool } from '../../../test/integration/support/database.js';
import { AppModule } from '../../app.module.js';
import {
  configureHttp,
  MAILER,
  type MailMessage,
  type OutboxEnvelope,
} from '../../platform/index.js';
import { IamMailConsumer } from './adapters/in/events/iam-mail.consumer.js';
import { Argon2PasswordHasher } from './adapters/out/security/security-adapters.js';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'un-cielo-gris-sobre-lima';
const HOUR = 60 * 60 * 1000;

class FakeClock implements Clock {
  current = new Date();
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const clock = new FakeClock();
const sent: MailMessage[] = [];
let app: INestApplication<App>;
let consumer: IamMailConsumer;
const hasher = new Argon2PasswordHasher();

async function createAccount(
  status: 'ACTIVE' | 'PENDING' | 'DISABLED' = 'ACTIVE',
  overrides: { isPlatformAdmin?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const userId = id();
  const email = `persona-${userId}@demo.test`;
  await pool('owner').query(
    `INSERT INTO iam.user_account (id, email, password_hash, display_name, status, is_platform_admin)
     VALUES ($1, $2, $3, 'Persona de prueba', $4, $5)`,
    [userId, email, await hasher.hash(PASSWORD), status, overrides.isPlatformAdmin ?? false],
  );
  return { id: userId, email };
}

const post = (path: string, body: object, cookie?: string) => {
  const req = request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);
  return cookie ? req.set('Cookie', cookie) : req;
};
const get = (path: string, cookie?: string) => {
  const req = request(app.getHttpServer()).get(`/api/v1${path}`);
  return cookie ? req.set('Cookie', cookie) : req;
};
const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('nc_session=')) ?? '';
  return cookie.split(';')[0] ?? '';
};
const login = (email: string, password = PASSWORD, cookie?: string) =>
  post('/auth/login', { email, password }, cookie);

/** Entrega al consumidor de correos los eventos del outbox de un agregado, como lo haría el worker. */
async function deliverMail(aggregateId: string): Promise<void> {
  const { rows } = await pool('owner').query<{
    id: string;
    event_type: string;
    aggregate_id: string;
    payload: unknown;
    occurred_at: Date;
  }>(
    `SELECT id, event_type, aggregate_id, payload, occurred_at FROM platform.outbox_event
     WHERE aggregate_id = $1 ORDER BY id`,
    [aggregateId],
  );
  for (const row of rows) {
    const envelope: OutboxEnvelope = {
      eventId: row.id,
      type: row.event_type,
      version: 1,
      occurredAt: row.occurred_at.toISOString(),
      organizationId: null,
      aggregateType: 'iam',
      aggregateId: row.aggregate_id,
      payload: row.payload,
      metadata: {},
    };
    await consumer.handle(envelope);
  }
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
  consumer = moduleRef.get(IamMailConsumer);
});

beforeEach(() => {
  clock.current = new Date();
  sent.length = 0;
});

afterAll(async () => {
  await app.close();
});

describe('RF-01 · entrar', () => {
  it('abre una sesión con cookie httpOnly, Secure, SameSite=Lax y Path=/, sin caché, y la audita sin organización', async () => {
    const account = await createAccount();
    const response = await login(account.email.toUpperCase());

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const raw = (response.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/Secure/);
    expect(raw).toMatch(/SameSite=Lax/);
    expect(raw).toMatch(/Path=\//);
    expect(response.body).toMatchObject({
      id: account.id,
      kind: 'STAFF',
      activeOrganizationId: null,
      memberships: [],
    });

    const me = await get('/account', sessionCookie(response));
    expect(me.status).toBe(200);
    const audit = await pool('owner').query(
      `SELECT action, organization_id FROM audit.audit_log WHERE actor_user_id = $1`,
      [account.id],
    );
    expect(audit.rows).toEqual([{ action: 'LOGIN', organization_id: null }]);
  });

  it('RN-A07 · toda falla responde igual: contraseña errada, correo inexistente, cuenta pendiente o deshabilitada', async () => {
    const active = await createAccount();
    const pending = await createAccount('PENDING');
    const disabled = await createAccount('DISABLED');
    const responses = await Promise.all([
      login(active.email, 'otra-contraseña-larga'),
      login(`nadie-${id()}@demo.test`),
      login(pending.email),
      login(disabled.email),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'NC-IAM-010',
        rule: 'RN-A07',
        title:
          'Correo o contraseña incorrectos. Tras 5 intentos fallidos, el acceso se pausa 15 minutos.',
      });
    }
    const failed = await pool('owner').query(
      `SELECT count(*)::int AS n FROM audit.audit_log WHERE action = 'LOGIN_FAILED' AND actor_user_id = $1`,
      [active.id],
    );
    expect(failed.rows[0]).toEqual({ n: 1 });
  });

  it('RN-A07 · cinco fallos bloquean 15 minutos; bloqueada responde igual y no suma; al vencer vuelve a 0', async () => {
    const account = await createAccount();
    for (let i = 0; i < 5; i += 1)
      expect((await login(account.email, 'otra-contraseña-larga')).status).toBe(401);
    const state = () =>
      pool('owner').query<{ failed_logins: number; locked: boolean }>(
        `SELECT failed_logins, locked_until > now() AS locked FROM iam.user_account WHERE id = $1`,
        [account.id],
      );
    expect((await state()).rows[0]).toEqual({ failed_logins: 5, locked: true });

    const whileLocked = await login(account.email);
    expect(whileLocked.status).toBe(401);
    expect(whileLocked.body).toMatchObject({ code: 'NC-IAM-010' });
    await login(account.email, 'otra-contraseña-larga');
    expect((await state()).rows[0]).toEqual({ failed_logins: 5, locked: true });

    await pool('owner').query(
      `UPDATE iam.user_account SET locked_until = now() - interval '1 second' WHERE id = $1`,
      [account.id],
    );
    await login(account.email, 'otra-contraseña-larga');
    expect((await state()).rows[0]).toEqual({ failed_logins: 1, locked: null });
    expect((await login(account.email)).status).toBe(200);
    expect((await state()).rows[0]).toEqual({ failed_logins: 0, locked: null });
  });

  it('P5 · CSRF: entrar sin Origin o con otro Origin responde 403', async () => {
    const account = await createAccount();
    const withoutOrigin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: PASSWORD });
    const otherOrigin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://otro.sitio')
      .send({ email: account.email, password: PASSWORD });

    expect(withoutOrigin.status).toBe(403);
    expect(otherOrigin.status).toBe(403);
  });

  it('entrar con una sesión válida en la cookie la revoca antes de abrir la nueva', async () => {
    const account = await createAccount();
    const first = sessionCookie(await login(account.email));
    const second = sessionCookie(await login(account.email, PASSWORD, first));

    expect((await get('/account', first)).status).toBe(401);
    expect((await get('/account', second)).status).toBe(200);
  });

  it('una cuenta de plataforma entra con sesión PLATFORM', async () => {
    const admin = await createAccount('ACTIVE', { isPlatformAdmin: true });
    expect((await login(admin.email)).body).toMatchObject({ kind: 'PLATFORM', memberships: [] });
  });
});

describe('RN-A08 · vencimiento de la sesión de profesional', () => {
  it('vence tras 12 h de inactividad', async () => {
    const cookie = sessionCookie(await login((await createAccount()).email));
    clock.advance(12 * HOUR - 1000);
    expect((await get('/account', cookie)).status).toBe(200);
    clock.advance(12 * HOUR);
    expect((await get('/account', cookie)).status).toBe(401);
  });

  it('el uso desliza la inactividad, pero a los 7 días vence igual', async () => {
    const cookie = sessionCookie(await login((await createAccount()).email));
    for (let elapsed = 0; elapsed < 7 * 24 * HOUR - 11 * HOUR; elapsed += 11 * HOUR) {
      clock.advance(11 * HOUR);
      expect((await get('/account', cookie)).status).toBe(200);
    }
    clock.advance(11 * HOUR);
    expect((await get('/account', cookie)).status).toBe(401);
  });

  it('si la cuenta deja de estar ACTIVE, la sesión deja de servir en la petición siguiente', async () => {
    const account = await createAccount();
    const cookie = sessionCookie(await login(account.email));
    await pool('owner').query(`UPDATE iam.user_account SET status = 'DISABLED' WHERE id = $1`, [
      account.id,
    ]);
    expect((await get('/account', cookie)).status).toBe(401);
  });
});

describe('RN-A08 · cerrar sesión, una o todas', () => {
  it('salir revoca la sesión y borra la cookie', async () => {
    const cookie = sessionCookie(await login((await createAccount()).email));
    const out = await post('/auth/logout', {}, cookie);

    expect(out.status).toBe(204);
    expect((out.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/nc_session=;/);
    expect((await get('/account', cookie)).status).toBe(401);
  });

  it('lista las sesiones, cierra una ajena a la actual y luego todas', async () => {
    const account = await createAccount();
    const laptop = sessionCookie(await login(account.email));
    const phone = sessionCookie(await login(account.email));
    const list = await get('/account/sessions', laptop);

    const { sessions } = list.body as { sessions: { id: string; current: boolean }[] };
    expect(sessions).toHaveLength(2);
    const other = sessions.find((s) => !s.current);
    const del = await request(app.getHttpServer())
      .delete(`/api/v1/account/sessions/${other?.id ?? ''}`)
      .set('Origin', ORIGIN)
      .set('Cookie', laptop);
    expect(del.status).toBe(204);
    expect((await get('/account', phone)).status).toBe(401);

    const strangers = await request(app.getHttpServer())
      .delete(`/api/v1/account/sessions/${id()}`)
      .set('Origin', ORIGIN)
      .set('Cookie', laptop);
    expect(strangers.status).toBe(404);

    expect((await post('/account/sessions/revoke-all', {}, laptop)).status).toBe(204);
    expect((await get('/account', laptop)).status).toBe(401);
  });
});

describe('RN-A07 y RN-A08 · cambiar la contraseña', () => {
  it('pide la actual, valida la nueva, revoca todas las sesiones, abre una nueva y avisa por correo', async () => {
    const account = await createAccount();
    const other = sessionCookie(await login(account.email));
    const current = sessionCookie(await login(account.email));

    const wrong = await post(
      '/account/password',
      { currentPassword: 'no-es-la-actual', newPassword: 'otra-frase-muy-larga' },
      current,
    );
    expect(wrong.body).toMatchObject({ status: 400, code: 'NC-IAM-011' });
    const weak = await post(
      '/account/password',
      { currentPassword: PASSWORD, newPassword: 'contraseña123' },
      current,
    );
    expect(weak.body).toMatchObject({ status: 422, code: 'NC-IAM-002', rule: 'RN-A07' });

    const changed = await post(
      '/account/password',
      { currentPassword: PASSWORD, newPassword: 'otra-frase-muy-larga' },
      current,
    );
    expect(changed.status).toBe(204);
    const fresh = sessionCookie(changed);
    expect((await get('/account', current)).status).toBe(401);
    expect((await get('/account', other)).status).toBe(401);
    expect((await get('/account', fresh)).status).toBe(200);

    await deliverMail(account.id);
    expect(sent).toEqual([
      expect.objectContaining({ to: account.email, subject: 'Tu contraseña cambió' }),
    ]);
  });
});

describe('RF-01 · recuperar la contraseña', () => {
  const tokenFrom = (message: MailMessage | undefined): string =>
    /\/recuperar\/nueva#([A-Za-z0-9_-]{43})/.exec(message?.text ?? '')?.[1] ?? '';

  it('responde 202 exista o no la cuenta; solo la ACTIVE recibe enlace, con el token en el fragmento', async () => {
    const account = await createAccount();
    expect((await post('/auth/password-reset', { email: `nadie-${id()}@demo.test` })).status).toBe(
      202,
    );
    expect((await post('/auth/password-reset', { email: account.email })).status).toBe(202);

    const { rows } = await pool('owner').query<{ id: string; payload: unknown }>(
      `SELECT r.id, o.payload FROM iam.password_reset r JOIN platform.outbox_event o ON o.aggregate_id = r.id
       WHERE r.user_id = $1`,
      [account.id],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.payload)).not.toMatch(/[A-Za-z0-9_-]{43}"/);

    await deliverMail(rows[0]?.id ?? '');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(account.email);
    expect(tokenFrom(sent[0])).toHaveLength(43);
  });

  it('fija la contraseña una sola vez, aunque lleguen dos a la vez; revoca las sesiones y no inicia sesión', async () => {
    const account = await createAccount();
    const session = sessionCookie(await login(account.email));
    await post('/auth/password-reset', { email: account.email });
    const reset = await pool('owner').query<{ id: string }>(
      `SELECT id FROM iam.password_reset WHERE user_id = $1`,
      [account.id],
    );
    await deliverMail(reset.rows[0]?.id ?? '');
    const token = tokenFrom(sent[0]);

    const [a, b] = await Promise.all([
      post('/auth/password-reset/confirm', { token, newPassword: 'frase-nueva-de-acceso' }),
      post('/auth/password-reset/confirm', { token, newPassword: 'frase-nueva-de-acceso' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
    expect([a, b].find((r) => r.status === 400)?.body).toMatchObject({ code: 'NC-IAM-030' });
    expect(a.headers['set-cookie']).toBeUndefined();
    expect((await get('/account', session)).status).toBe(401);
    expect((await login(account.email, 'frase-nueva-de-acceso')).status).toBe(200);
  });

  it('un pedido nuevo invalida el enlace anterior', async () => {
    const account = await createAccount();
    await post('/auth/password-reset', { email: account.email });
    const first = await pool('owner').query<{ id: string }>(
      `SELECT id FROM iam.password_reset WHERE user_id = $1`,
      [account.id],
    );
    await deliverMail(first.rows[0]?.id ?? '');
    const oldToken = tokenFrom(sent[0]);
    await post('/auth/password-reset', { email: account.email });

    const response = await post('/auth/password-reset/confirm', {
      token: oldToken,
      newPassword: 'frase-nueva-de-acceso',
    });
    expect(response.body).toMatchObject({ code: 'NC-IAM-030' });
  });
});

describe('ADR-030 · límite de intentos por función', () => {
  it('cuenta en una ventana fija y, pasado el máximo, dice cuántos segundos faltan', async () => {
    const key = Buffer.alloc(32, Math.floor(Math.random() * 255));
    const hit = () =>
      pool('user').query<{ hits: number; allowed: boolean; retry_after_seconds: number }>(
        'SELECT * FROM app.hit_rate_limit($1, 900, 3)',
        [key],
      );
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await hit()).rows[0]);

    expect(results.map((r) => r?.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retry_after_seconds).toBeGreaterThan(0);
    expect(results[3]?.retry_after_seconds).toBeLessThanOrEqual(900);
  });

  it('app_user no puede leer ni escribir la tabla directo', async () => {
    const error = await pool('user')
      .query('SELECT * FROM platform.rate_limit')
      .catch((e: unknown) => (e as { code?: string }).code);
    expect(error).toBe('42501');
  });
});
