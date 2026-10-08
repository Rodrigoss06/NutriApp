import {
  domainError,
  err,
  isErr,
  isOk,
  ok,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TenancyApi } from '../../tenancy/index.js';
import { ActiveOrganizationHandler } from './commands/active-organization.handler.js';
import { InvitationHandlers } from './commands/invitation.handlers.js';
import { PasswordHandlers } from './commands/password.handlers.js';
import { IamApi } from './iam-api.js';
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
  MemoryInvitations,
  membershipsOf,
  MemoryResets,
  MemorySessions,
} from './iam-fakes.spec-support.js';

const PASSWORD = 'un-cielo-gris-sobre-lima';
const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const OWNER_ID = '0192f0a0-0000-7000-8000-0000000000aa' as UserId;
const QUOTA = domainError({ code: 'NC-TEN-001', rule: 'RN-A03', message: 'Sin cupo.' });

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let accounts: MemoryAccounts;
let sessions: MemorySessions;
let invitations: MemoryInvitations;
let tokens: FakeTokens;
let hasher: FakeHasher;
let members: Set<string>;
let capacity: number;

/** TenancyApi falsa: cupo fijo de staff, miembros en un conjunto. */
const tenancy = () =>
  ({
    lockOrganization: () => Promise.resolve(),
    isMember: (_org: OrganizationId, userId: UserId) => Promise.resolve(members.has(userId)),
    ensureStaffCapacity: (_org: OrganizationId, pending: number) =>
      Promise.resolve(members.size + pending < capacity ? ok(undefined) : err(QUOTA)),
    invitationTtlDays: () => Promise.resolve(7),
    organization: () => Promise.resolve({ id: ORG, name: 'Consultorio Demo' }),
    addMemberFromInvitation: (input: { userId: UserId }) => {
      if (members.size + 1 > capacity) return Promise.resolve(err(QUOTA));
      members.add(input.userId);
      return Promise.resolve(ok(undefined));
    },
  }) as unknown as TenancyApi;

const handlers = () =>
  new InvitationHandlers(
    uow,
    clock,
    fakeIds,
    outbox,
    new FakeAudit(),
    fakeEncryption,
    invitations,
    accounts,
    sessions,
    hasher,
    fakeCommon(),
    tokens,
    tenancy(),
  );

const owner: SecurityContext = {
  organizationId: ORG,
  userId: OWNER_ID,
  role: 'OWNER',
  patientId: null,
};
const accept = (token: string, extra: { password?: string; displayName?: string } = {}) =>
  handlers().accept({
    token,
    password: extra.password ?? PASSWORD,
    displayName: extra.displayName,
    currentTokenHash: null,
    ip: null,
    userAgent: null,
  });

/** El token del evento iam.invitation.created, descifrado como lo haría el worker. */
const lastToken = (): string => {
  const event = [...outbox.events].reverse().find((e) => e.type === 'iam.invitation.created');
  const payload = event?.payload as { invitationId: string; encryptedToken: string };
  return fakeEncryption.decrypt(
    Buffer.from(payload.encryptedToken, 'base64'),
    `iam.invitation:${payload.invitationId}`,
  );
};

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  accounts = new MemoryAccounts(clock);
  sessions = new MemorySessions(accounts);
  invitations = new MemoryInvitations();
  tokens = new FakeTokens();
  hasher = new FakeHasher();
  members = new Set([OWNER_ID]);
  capacity = 3;
});

describe('RF-01 · invitar', () => {
  it('crea la invitación con el plazo de la organización y el token cifrado en el evento, nunca en claro', async () => {
    const result = await handlers().invite(owner, {
      email: 'Profe@Demo.test',
      role: 'PROFESSIONAL',
    });
    expect(isOk(result)).toBe(true);
    const [row] = invitations.rows.values();
    expect(row?.email).toBe('profe@demo.test');
    expect((row?.expiresAt.getTime() ?? 0) - clock.now().getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(outbox.events)).not.toContain(lastToken());
    expect((await handlers().list(owner)).map((i) => i.email)).toEqual(['profe@demo.test']);
  });

  it('RN-A04 · solo OWNER invita OWNER; un miembro vigente es 409; una cuenta de plataforma no se une', async () => {
    const admin = { ...owner, role: 'ADMIN' as const };
    const asAdmin = await handlers().invite(admin, { email: 'x@demo.test', role: 'OWNER' });
    expect(isErr(asAdmin) && asAdmin.error.code).toBe('NC-TEN-003');
    const member = accounts.add({ email: 'miembro@demo.test' });
    members.add(member.id);
    const again = await handlers().invite(owner, { email: member.email, role: 'PROFESSIONAL' });
    expect(isErr(again) && again.error.code).toBe('NC-TEN-020');
    accounts.add({ email: 'plataforma@demo.test', isPlatformAdmin: true });
    const platform = await handlers().invite(owner, {
      email: 'plataforma@demo.test',
      role: 'ADMIN',
    });
    expect(isErr(platform) && platform.error.code).toBe('NC-IAM-041');
  });

  it('RN-A03 · el cupo cuenta las invitaciones vigentes; reinvitar al mismo correo revoca la anterior', async () => {
    capacity = 2;
    expect(
      isOk(await handlers().invite(owner, { email: 'a@demo.test', role: 'PROFESSIONAL' })),
    ).toBe(true);
    expect(isOk(await handlers().invite(owner, { email: 'a@demo.test', role: 'ADMIN' }))).toBe(
      true,
    );
    expect(await handlers().list(owner)).toHaveLength(1);
    const over = await handlers().invite(owner, { email: 'b@demo.test', role: 'PROFESSIONAL' });
    expect(isErr(over) && over.error.rule).toBe('RN-A03');
    expect(outbox.events.filter((e) => e.type === 'iam.invitation.revoked')).toHaveLength(1);
  });

  it('reenviar y revocar: solo invitaciones pendientes de staff de la organización', async () => {
    const first = await handlers().invite(owner, { email: 'a@demo.test', role: 'PROFESSIONAL' });
    if (!first.ok) throw new Error('sin invitación');
    const resent = await handlers().resend(owner, first.value.id);
    expect(isOk(resent)).toBe(true);
    const again = await handlers().resend(owner, first.value.id);
    expect(isErr(again) && again.error.code).toBe('NC-IAM-043');
    if (!resent.ok) throw new Error('sin reenvío');
    expect(isOk(await handlers().revoke(owner, resent.value.id))).toBe(true);
    const twice = await handlers().revoke(owner, resent.value.id);
    expect(isErr(twice) && twice.error.code).toBe('NC-IAM-043');
    const missing = await handlers().revoke(owner, 'no-existe');
    expect(isErr(missing)).toBe(true);
    const ownerInvite = await handlers().invite(owner, { email: 'd@demo.test', role: 'OWNER' });
    if (!ownerInvite.ok) throw new Error('sin invitación');
    const admin = { ...owner, role: 'ADMIN' as const };
    expect(isErr(await handlers().revoke(admin, ownerInvite.value.id))).toBe(true);
    expect(isErr(await handlers().resend(admin, ownerInvite.value.id))).toBe(true);
  });
});

describe('RF-01 · abrir y aceptar', () => {
  it('cuenta nueva: pide nombre y una contraseña válida, crea la cuenta, el miembro y la sesión; un solo uso', async () => {
    await handlers().invite(owner, { email: 'nueva@demo.test', role: 'PROFESSIONAL' });
    const token = lastToken();
    const inspected = await handlers().inspect(token);
    expect(isOk(inspected) && inspected.value).toEqual({
      organizationName: 'Consultorio Demo',
      email: 'nueva@demo.test',
      role: 'PROFESSIONAL',
      accountExists: false,
    });
    const noName = await accept(token);
    expect(isErr(noName) && noName.error.code).toBe('NC-IAM-042');
    const weak = await accept(token, { password: 'corta', displayName: 'Nueva' });
    expect(isErr(weak) && weak.error.code).toBe('NC-IAM-001');

    const accepted = await accept(token, { displayName: 'Nueva' });
    expect(isOk(accepted) && accepted.value).toMatchObject({
      kind: 'STAFF',
      activeOrganizationId: ORG,
    });
    const account = await accounts.findByEmail('nueva@demo.test');
    expect(account?.status).toBe('ACTIVE');
    expect(members.has(account?.id ?? '')).toBe(true);
    expect(outbox.events.at(-1)?.type).toBe('iam.invitation.accepted');

    const again = await accept(token, { displayName: 'Nueva' });
    expect(isErr(again) && again.error.code).toBe('NC-IAM-040');
    expect(isErr(await handlers().inspect(token))).toBe(true);
  });

  it('cuenta ACTIVE: se acepta con la contraseña actual; otra cuenta como fallo de ingreso; bloqueada, igual', async () => {
    const existing = accounts.add({ email: 'activa@demo.test', passwordHash: `h:${PASSWORD}` });
    await handlers().invite(owner, { email: existing.email, role: 'ADMIN' });
    const token = lastToken();
    expect(
      isOk(await handlers().inspect(token)) && (await handlers().inspect(token)),
    ).toMatchObject({
      value: { accountExists: true },
    });
    const wrong = await accept(token, { password: 'otra-clave-cualquiera' });
    expect(isErr(wrong) && wrong.error.code).toBe('NC-IAM-010');
    const row = accounts.rows.get(existing.id);
    if (!row) throw new Error('sin cuenta');
    row.lockedUntil = new Date(clock.now().getTime() + 60_000);
    const locked = await accept(token);
    expect(isErr(locked) && locked.error.code).toBe('NC-IAM-010');
    expect(hasher.decoys).toBe(1);
    row.lockedUntil = null;
    const ok_ = await accept(token);
    expect(isOk(ok_) && ok_.value.userId).toBe(existing.id);
  });

  it('cuenta PENDING se activa; DISABLED o de plataforma no se une; vencida o anulada no sirve', async () => {
    const pending = accounts.add({ email: 'pendiente@demo.test', status: 'PENDING' });
    await handlers().invite(owner, { email: pending.email, role: 'PROFESSIONAL' });
    expect(isOk(await accept(lastToken(), { displayName: 'Ya activa' }))).toBe(true);
    expect(accounts.rows.get(pending.id)?.status).toBe('ACTIVE');

    accounts.add({ email: 'apagada@demo.test', status: 'DISABLED' });
    await handlers().invite(owner, { email: 'apagada@demo.test', role: 'PROFESSIONAL' });
    const disabled = await accept(lastToken(), { displayName: 'X' });
    expect(isErr(disabled) && disabled.error.code).toBe('NC-IAM-041');

    await handlers().invite(owner, { email: 'tarde@demo.test', role: 'PROFESSIONAL' });
    const late = lastToken();
    clock.advance(8 * 24 * 60 * 60 * 1000);
    expect(isErr(await accept(late, { displayName: 'Tarde' }))).toBe(true);
    expect(isErr(await accept('desconocido'.padEnd(43, 'x'), { displayName: 'X' }))).toBe(true);
  });

  it('RN-A03 · sin cupo al aceptar, la aceptación falla con la regla', async () => {
    capacity = 2;
    await handlers().invite(owner, { email: 'a@demo.test', role: 'PROFESSIONAL' });
    const token = lastToken();
    members.add('otro');
    const full = await accept(token, { displayName: 'A' });
    expect(isErr(full) && full.error.rule).toBe('RN-A03');
  });
});

describe('RF-02 · organización activa', () => {
  const session = (kind = 'STAFF') => ({ sessionId: 's1', userId: OWNER_ID, kind });

  it('solo a una organización con membresía activa; si no, no encontrado', async () => {
    await sessions.create({
      id: 's1',
      userId: OWNER_ID,
      tokenHash: new Uint8Array(32),
      kind: 'STAFF',
      activeOrganizationId: null,
      now: clock.now(),
      idleExpiresAt: clock.now(),
      absoluteExpiresAt: clock.now(),
      ip: null,
      userAgent: null,
    });
    const handler = new ActiveOrganizationHandler(
      uow,
      sessions,
      membershipsOf([
        { organizationId: ORG, organizationName: 'Org', role: 'OWNER', active: true },
      ]),
    );
    expect(isOk(await handler.execute(session(), ORG))).toBe(true);
    expect(sessions.rows.get('s1')?.activeOrganizationId).toBe(ORG);
    const other = '0192f0a0-0000-7000-8000-00000000000b' as OrganizationId;
    const foreign = await handler.execute(session(), other);
    expect(isErr(foreign) && foreign.error.code).toBe('NC-IAM-050');
    expect(isErr(await handler.execute(session('PLATFORM'), ORG))).toBe(true);
  });
});

describe('IamApi · primer administrador de plataforma', () => {
  it('cuenta sin contraseña y enlace de bienvenida de 24 horas; un correo existente es error', async () => {
    const resets = new MemoryResets();
    const passwords = new PasswordHandlers(
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
    const api = new IamApi(handlers(), passwords);
    expect(isOk(await api.createPlatformAdmin('Admin@Demo.test', 'Admin'))).toBe(true);
    const account = await accounts.findByEmail('admin@demo.test');
    expect(account).toMatchObject({ isPlatformAdmin: true, passwordHash: null, status: 'ACTIVE' });
    const [reset] = resets.rows.values();
    expect(reset && reset.expiresAt.getTime() - clock.now().getTime()).toBe(24 * 60 * 60 * 1000);
    expect(outbox.events.at(-1)?.payload).toMatchObject({ welcome: true });
    const twice = await api.createPlatformAdmin('admin@demo.test', 'Admin');
    expect(isErr(twice) && twice.error.code).toBe('NC-IAM-012');

    expect(isOk(await api.inviteWithin(owner, ORG, 'Otro@Demo.test', 'ADMIN'))).toBe(true);
    expect((await handlers().list(owner))[0]?.email).toBe('otro@demo.test');
  });
});
