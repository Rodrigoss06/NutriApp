import { isErr, isOk, type OrganizationId } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthenticateSessionHandler } from './commands/authenticate-session.handler.js';
import { EndSessionsHandler } from './commands/end-sessions.handler.js';
import { LoginHandler } from './commands/login.handler.js';
import { PasswordHandlers, RESET_TTL_MS } from './commands/password.handlers.js';
import { UpdateAccountHandler } from './commands/update-account.handler.js';
import {
  FakeAudit,
  FakeClock,
  fakeCommon,
  fakeEncryption,
  FakeHasher,
  fakeIds,
  FakeOutbox,
  FakeTokens,
  FakeUow,
  MemoryAccounts,
  membershipsOf,
  MemoryResets,
  MemorySessions,
} from './iam-fakes.spec-support.js';
import type { MembershipSummary } from './ports/iam.ports.js';
import { AccountQueries } from './queries/account.queries.js';

const PASSWORD = 'un-cielo-gris-sobre-lima';
const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;

let clock: FakeClock;
let uow: FakeUow;
let audit: FakeAudit;
let outbox: FakeOutbox;
let accounts: MemoryAccounts;
let sessions: MemorySessions;
let resets: MemoryResets;
let hasher: FakeHasher;
let tokens: FakeTokens;

const loginWith = (memberships: MembershipSummary[] = []) =>
  new LoginHandler(
    uow,
    clock,
    fakeIds,
    audit,
    accounts,
    sessions,
    hasher,
    tokens,
    membershipsOf(memberships),
  );
const passwords = () =>
  new PasswordHandlers(
    uow,
    clock,
    fakeIds,
    outbox,
    fakeEncryption,
    accounts,
    sessions,
    resets,
    hasher,
    fakeCommon(),
    tokens,
  );
const command = (email: string, password = PASSWORD) => ({
  email,
  password,
  currentTokenHash: null,
  ip: '203.0.113.7',
  userAgent: 'prueba',
});

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  audit = new FakeAudit();
  outbox = new FakeOutbox();
  accounts = new MemoryAccounts(clock);
  sessions = new MemorySessions(accounts);
  resets = new MemoryResets();
  hasher = new FakeHasher();
  tokens = new FakeTokens();
});

describe('RF-01 · RN-A07 · entrar', () => {
  it('abre una sesión STAFF y la audita sin organización', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const result = await loginWith().execute(command('  ANA@demo.test '));

    expect(isOk(result) && result.value).toMatchObject({
      userId: account.id,
      kind: 'STAFF',
      activeOrganizationId: null,
    });
    expect(sessions.alive(account.id)).toBe(1);
    expect(audit.entries.map((e) => [e.entry.action, e.context.organizationId])).toEqual([
      ['LOGIN', null],
    ]);
  });

  it('fija sola la organización activa si hay una sola membresía activa', async () => {
    accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const one = await loginWith([
      { organizationId: ORG, organizationName: 'A', role: 'OWNER', active: true },
    ]).execute(command('ana@demo.test'));
    const two = await loginWith([
      { organizationId: ORG, organizationName: 'A', role: 'OWNER', active: true },
      {
        organizationId: '0192f0a0-0000-7000-8000-00000000000b' as OrganizationId,
        organizationName: 'B',
        role: 'ADMIN',
        active: true,
      },
    ]).execute(command('ana@demo.test'));

    expect(isOk(one) && one.value.activeOrganizationId).toBe(ORG);
    expect(isOk(two) && two.value.activeOrganizationId).toBeNull();
  });

  it('una cuenta de plataforma entra con sesión PLATFORM, sin organización', async () => {
    accounts.add({
      email: 'admin@demo.test',
      passwordHash: `h:${PASSWORD}`,
      isPlatformAdmin: true,
    });
    const result = await loginWith([
      { organizationId: ORG, organizationName: 'A', role: 'OWNER', active: true },
    ]).execute(command('admin@demo.test'));

    expect(isOk(result) && result.value).toMatchObject({
      kind: 'PLATFORM',
      activeOrganizationId: null,
    });
  });

  it('toda falla es INVALID_CREDENTIALS; sin cuenta usable se verifica el señuelo y no suma', async () => {
    accounts.add({ email: 'pendiente@demo.test', passwordHash: null, status: 'PENDING' });
    const active = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });

    const results = [
      await loginWith().execute(command('nadie@demo.test')),
      await loginWith().execute(command('pendiente@demo.test')),
      await loginWith().execute(command('ana@demo.test', 'otra-contraseña-larga')),
    ];

    expect(results.map((r) => isErr(r) && r.error.code)).toEqual([
      'NC-IAM-010',
      'NC-IAM-010',
      'NC-IAM-010',
    ]);
    expect(hasher.decoys).toBe(2);
    expect(accounts.rows.get(active.id)?.failedLogins).toBe(1);
    expect(audit.entries.map((e) => [e.entry.action, e.context.role])).toEqual([
      ['LOGIN_FAILED', 'ANONYMOUS'],
      ['LOGIN_FAILED', 'ANONYMOUS'],
      ['LOGIN_FAILED', 'ANONYMOUS'],
    ]);
  });

  it('bloqueada responde igual aunque la contraseña sea correcta', async () => {
    accounts.add({
      email: 'ana@demo.test',
      passwordHash: `h:${PASSWORD}`,
      lockedUntil: new Date(clock.now().getTime() + 60_000),
    });
    const result = await loginWith().execute(command('ana@demo.test'));

    expect(isErr(result) && result.error.code).toBe('NC-IAM-010');
    expect(hasher.decoys).toBe(1);
  });

  it('con una sesión válida en la cookie, la revoca antes de abrir la nueva', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const first = await loginWith().execute(command('ana@demo.test'));
    const previousHash = tokens.hash(isOk(first) ? first.value.token : '');
    await loginWith().execute({ ...command('ana@demo.test'), currentTokenHash: previousHash });

    expect(sessions.alive(account.id)).toBe(1);
  });
});

describe('RN-A08 · sesiones', () => {
  it('autentica, desliza una vez por minuto y rechaza la cuenta que deja de estar ACTIVE', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const login = await loginWith().execute(command('ana@demo.test'));
    const hash = tokens.hash(isOk(login) ? login.value.token : '');
    const authenticate = new AuthenticateSessionHandler(uow, clock, sessions);

    expect(await authenticate.execute(hash)).not.toBeNull();
    clock.advance(2 * 60_000);
    const slid = await authenticate.execute(hash);
    expect(slid?.lastSeenAt).toEqual(clock.now());

    const row = accounts.rows.get(account.id);
    if (row) row.status = 'DISABLED';
    expect(await authenticate.execute(hash)).toBeNull();
    expect(await authenticate.execute(tokens.hash('otro'))).toBeNull();
  });

  it('salir, cerrar una ajena y cerrar todas', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const a = await loginWith().execute(command('ana@demo.test'));
    const b = await loginWith().execute(command('ana@demo.test'));
    const handler = new EndSessionsHandler(uow, clock, audit, sessions);

    await handler.logout(account.id, isOk(a) ? a.value.sessionId : '');
    expect(sessions.alive(account.id)).toBe(1);
    expect(await handler.revokeOne(account.id, 'no-existe')).toBe(false);
    expect(await handler.revokeOne(account.id, isOk(b) ? b.value.sessionId : '')).toBe(true);
    await loginWith().execute(command('ana@demo.test'));
    await handler.revokeAll(account.id);
    expect(sessions.alive(account.id)).toBe(0);
    expect(audit.entries.filter((e) => e.entry.action === 'LOGOUT')).toHaveLength(2);
  });
});

describe('RN-A07 · cambiar y recuperar la contraseña', () => {
  it('cambiarla pide la actual, valida la nueva, revoca todas, abre una nueva y avisa', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    await loginWith().execute(command('ana@demo.test'));
    const session = { kind: 'STAFF' as const, activeOrganizationId: null };
    const input = (currentPassword: string, newPassword: string) => ({
      currentPassword,
      newPassword,
      ip: null,
      userAgent: null,
    });

    const wrong = await passwords().change(
      account.id,
      session,
      input('no', 'frase-nueva-de-acceso'),
    );
    const weak = await passwords().change(account.id, session, input(PASSWORD, 'contraseña123'));
    const ok = await passwords().change(
      account.id,
      session,
      input(PASSWORD, 'frase-nueva-de-acceso'),
    );

    expect(isErr(wrong) && wrong.error.code).toBe('NC-IAM-011');
    expect(isErr(weak) && weak.error.code).toBe('NC-IAM-002');
    expect(isOk(ok)).toBe(true);
    expect(sessions.alive(account.id)).toBe(1);
    expect(accounts.rows.get(account.id)?.passwordHash).toBe('h:frase-nueva-de-acceso');
    expect(outbox.events.map((e) => [e.type, e.payload])).toEqual([
      ['iam.password.changed', { reason: 'CHANGED' }],
    ]);
  });

  it('pedir el enlace: nada para cuentas inexistentes o no ACTIVE; el nuevo invalida el anterior', async () => {
    accounts.add({ email: 'pendiente@demo.test', status: 'PENDING' });
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });

    await passwords().requestReset('nadie@demo.test');
    await passwords().requestReset('pendiente@demo.test');
    expect(outbox.events).toEqual([]);

    await passwords().requestReset('ana@demo.test');
    await passwords().requestReset('ana@demo.test');
    const pending = [...resets.rows.values()].filter(
      (r) => r.userId === account.id && r.expiresAt > clock.now(),
    );
    expect(pending).toHaveLength(1);
    expect(outbox.events.map((e) => e.type)).toEqual([
      'iam.reset.requested',
      'iam.reset.requested',
    ]);
    const payload = outbox.events[0]?.payload as { resetId: string; encryptedToken: string };
    expect(Buffer.from(payload.encryptedToken, 'base64').toString()).toContain(
      `iam.reset:${payload.resetId}|`,
    );
  });

  it('fijarla con el enlace: un solo uso, vence en una hora y revoca las sesiones', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    await loginWith().execute(command('ana@demo.test'));
    await passwords().requestReset('ana@demo.test');
    const encrypted = (outbox.events[0]?.payload as { encryptedToken: string }).encryptedToken;
    const token = Buffer.from(encrypted, 'base64').toString().split('|')[1] ?? '';

    expect(isErr(await passwords().confirmReset(token, 'contraseña123'))).toBe(true);
    expect(isOk(await passwords().confirmReset(token, 'frase-nueva-de-acceso'))).toBe(true);
    const again = await passwords().confirmReset(token, 'otra-frase-de-acceso');
    expect(isErr(again) && again.error.code).toBe('NC-IAM-030');
    expect(sessions.alive(account.id)).toBe(0);

    await passwords().requestReset('ana@demo.test');
    const late =
      Buffer.from(
        (outbox.events.at(-1)?.payload as { encryptedToken: string }).encryptedToken,
        'base64',
      )
        .toString()
        .split('|')[1] ?? '';
    clock.advance(RESET_TTL_MS);
    expect(isErr(await passwords().confirmReset(late, 'otra-frase-de-acceso'))).toBe(true);
  });
});

describe('la propia cuenta', () => {
  it('muestra las membresías activas, las sesiones vivas y cambia el nombre', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    const login = await loginWith().execute(command('ana@demo.test'));
    const queries = new AccountQueries(
      uow,
      clock,
      accounts,
      sessions,
      membershipsOf([
        { organizationId: ORG, organizationName: 'A', role: 'OWNER', active: true },
        { organizationId: ORG, organizationName: 'B', role: 'ADMIN', active: false },
      ]),
    );

    await new UpdateAccountHandler(uow, clock, accounts).execute(account.id, 'Ana Pérez');
    const view = await queries.account(account.id, { kind: 'STAFF', activeOrganizationId: ORG });
    const platform = await queries.account(account.id, {
      kind: 'PLATFORM',
      activeOrganizationId: null,
    });
    const list = await queries.sessionsOf(account.id, isOk(login) ? login.value.sessionId : '');

    expect(view).toMatchObject({
      displayName: 'Ana Pérez',
      memberships: [{ organizationName: 'A' }],
    });
    expect(platform?.memberships).toEqual([]);
    expect(list.map((s) => s.current)).toEqual([true]);
    expect(
      await queries.account('0192f0a0-0000-7000-8000-0000000000ff' as never, {
        kind: 'STAFF',
        activeOrganizationId: null,
      }),
    ).toBeNull();
  });
});
