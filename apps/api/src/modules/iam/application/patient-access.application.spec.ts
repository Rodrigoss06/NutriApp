import {
  domainError,
  err,
  isErr,
  isOk,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TenancyApi } from '../../tenancy/index.js';
import { AuthenticateSessionHandler } from './commands/authenticate-session.handler.js';
import { InvitationHandlers } from './commands/invitation.handlers.js';
import { LoginHandler } from './commands/login.handler.js';
import { PatientInvitationHandlers } from './commands/patient-invitation.handlers.js';
import { IamApi } from './iam-api.js';
import { PasswordHandlers } from './commands/password.handlers.js';
import {
  FakeAudit,
  FakeClock,
  fakeCommon,
  fakeEncryption,
  FakeEnrollment,
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
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const STAFF: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000aa' as UserId,
  role: 'PROFESSIONAL',
  patientId: null,
};

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let accounts: MemoryAccounts;
let sessions: MemorySessions;
let invitations: MemoryInvitations;
let tokens: FakeTokens;
let hasher: FakeHasher;
let enrollment: FakeEnrollment;

const tenancy = () =>
  ({
    patientInvitationTtlDays: () => Promise.resolve(3),
    organization: () =>
      Promise.resolve({ id: ORG, name: 'Consultorio Demo', timezone: 'America/Lima' }),
  }) as unknown as TenancyApi;

const patients = () =>
  new PatientInvitationHandlers(
    uow,
    clock,
    fakeIds,
    outbox,
    audit,
    fakeEncryption,
    invitations,
    accounts,
    sessions,
    hasher,
    fakeCommon(),
    tokens,
    tenancy(),
    enrollment,
  );

const handlers = () =>
  new InvitationHandlers(
    uow,
    clock,
    fakeIds,
    outbox,
    audit,
    fakeEncryption,
    invitations,
    accounts,
    sessions,
    hasher,
    fakeCommon(),
    tokens,
    tenancy(),
    patients(),
  );

/** El token del último iam.invitation.created, descifrado como lo haría el worker. */
const lastToken = (): string => {
  const event = [...outbox.events].reverse().find((e) => e.type === 'iam.invitation.created');
  const payload = event?.payload as { invitationId: string; encryptedToken: string };
  return fakeEncryption.decrypt(
    Buffer.from(payload.encryptedToken, 'base64'),
    `iam.invitation:${payload.invitationId}`,
  );
};

const preview = (overrides: object = {}) => ({
  patientId: PATIENT,
  organizationId: ORG,
  firstName: 'Ana',
  needsGuardian: false,
  linked: false,
  active: true,
  pendingPurposes: ['APP_ACCESS', 'HEALTH_DATA'] as const,
  ...overrides,
});

const accept = (token: string, extra: object = {}) =>
  handlers().accept({
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: ['doc-APP_ACCESS', 'doc-HEALTH_DATA'],
    currentTokenHash: null,
    ip: '203.0.113.7',
    userAgent: 'prueba',
    ...extra,
  });

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  accounts = new MemoryAccounts(clock);
  sessions = new MemorySessions(accounts);
  invitations = new MemoryInvitations();
  tokens = new FakeTokens();
  hasher = new FakeHasher();
  enrollment = new FakeEnrollment();
});

describe('RN-A06 · invitar al paciente', () => {
  it('crea la invitación PATIENT con su propio plazo; reenviar revoca la anterior; la pendiente se consulta', async () => {
    const first = await patients().inviteWithin(STAFF, ORG, PATIENT, 'ana@demo.test');
    expect(isOk(first)).toBe(true);
    const [row] = invitations.rows.values();
    expect(row).toMatchObject({ role: 'PATIENT', patientId: PATIENT, email: 'ana@demo.test' });
    expect((row?.expiresAt.getTime() ?? 0) - clock.now().getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(isOk(await patients().inviteWithin(STAFF, ORG, PATIENT, 'otro@demo.test'))).toBe(true);
    expect([...invitations.rows.values()].filter((i) => !i.revokedAt)).toHaveLength(1);
    expect(await patients().pendingFor(PATIENT)).toMatchObject({ email: 'otro@demo.test' });
    expect(outbox.events.filter((e) => e.type === 'iam.invitation.revoked')).toHaveLength(1);
    expect(await patients().pendingFor('otro-paciente')).toBeNull();
  });

  it('un correo con cuenta o con otra invitación pendiente no sirve (409)', async () => {
    accounts.add({ email: 'staff@demo.test' });
    const taken = await patients().inviteWithin(STAFF, ORG, PATIENT, 'staff@demo.test');
    expect(isErr(taken) && taken.error.code).toBe('NC-IAM-044');
    await patients().inviteWithin(STAFF, ORG, 'otro-paciente', 'compartido@demo.test');
    const shared = await patients().inviteWithin(STAFF, ORG, PATIENT, 'compartido@demo.test');
    expect(isErr(shared) && shared.error.code).toBe('NC-IAM-045');
  });

  it('IamApi delega en los handlers y da nombres sin correos', async () => {
    const passwords = new PasswordHandlers(
      uow,
      clock,
      fakeIds,
      outbox,
      fakeEncryption,
      accounts,
      sessions,
      new MemoryResets(),
      hasher,
      fakeCommon(),
      tokens,
    );
    const api = new IamApi(handlers(), patients(), passwords, accounts);
    expect(isOk(await api.invitePatientWithin(STAFF, ORG, PATIENT, 'Ana@Demo.test'))).toBe(true);
    expect(await api.pendingPatientInvitation(PATIENT)).toMatchObject({ email: 'ana@demo.test' });
    const person = accounts.add({ email: 'x@demo.test', displayName: 'Persona X' });
    expect((await api.displayNames([person.id])).get(person.id)).toBe('Persona X');
  });
});

describe('RN-A06 · ver y aceptar la invitación del paciente', () => {
  it('ver: los textos pendientes, una casilla por finalidad; un menor de 14 con pendientes no tiene casillas', async () => {
    await patients().inviteWithin(STAFF, ORG, PATIENT, 'ana@demo.test');
    const token = lastToken();
    expect(isErr(await handlers().inspect(token))).toBe(true);
    enrollment.previewValue = preview();
    const inspected = await handlers().inspect(token);
    expect(isOk(inspected) && inspected.value).toMatchObject({
      role: 'PATIENT',
      email: 'ana@demo.test',
      accountExists: false,
      needsGuardianConsent: false,
      firstName: 'Ana',
    });
    expect(
      isOk(inspected) && inspected.value.consents.map((c) => [c.purpose, c.provisional]),
    ).toEqual([
      ['APP_ACCESS', true],
      ['HEALTH_DATA', true],
    ]);
    enrollment.previewValue = preview({ needsGuardian: true });
    const child = await handlers().inspect(token);
    expect(isOk(child) && child.value).toMatchObject({ needsGuardianConsent: true, consents: [] });
    enrollment.previewValue = preview({ needsGuardian: true, pendingPurposes: [] });
    const signed = await handlers().inspect(token);
    expect(isOk(signed) && signed.value).toMatchObject({
      needsGuardianConsent: false,
      consents: [],
    });
    enrollment.previewValue = preview({ linked: true });
    expect(isErr(await handlers().inspect(token))).toBe(true);
  });

  it('aceptar crea la cuenta, inscribe con los consentimientos aceptados y abre una sesión PATIENT; un solo uso', async () => {
    await patients().inviteWithin(STAFF, ORG, PATIENT, 'ana@demo.test');
    const token = lastToken();
    enrollment.previewValue = preview();
    const accepted = await accept(token);
    expect(isOk(accepted) && accepted.value).toMatchObject({
      kind: 'PATIENT',
      activeOrganizationId: ORG,
    });
    const account = await accounts.findByEmail('ana@demo.test');
    expect(account).toMatchObject({ displayName: 'Ana', status: 'ACTIVE' });
    expect(enrollment.enrolled).toEqual([
      expect.objectContaining({
        patientId: PATIENT,
        userId: account?.id,
        acceptedConsentDocumentIds: ['doc-APP_ACCESS', 'doc-HEALTH_DATA'],
      }),
    ]);
    expect(outbox.events.at(-1)).toMatchObject({
      type: 'iam.invitation.accepted',
      payload: { role: 'PATIENT' },
    });
    expect(audit.entries.at(-1)?.entry).toMatchObject({ action: 'LOGIN' });
    expect(isErr(await accept(token))).toBe(true);
  });

  it('un correo que ya tiene cuenta, una contraseña débil o la inscripción rechazada no abren sesión', async () => {
    await patients().inviteWithin(STAFF, ORG, PATIENT, 'ana@demo.test');
    const token = lastToken();
    enrollment.previewValue = preview();
    const weak = await accept(token, { password: 'corta' });
    expect(isErr(weak) && weak.error.code).toBe('NC-IAM-001');
    enrollment.previewValue = preview({ active: false });
    expect(isErr(await accept(token))).toBe(true);
    enrollment.previewValue = preview();
    const other = accounts.add({ email: 'ana@demo.test' });
    const exists = await accept(token);
    expect(isErr(exists) && exists.error.code).toBe('NC-IAM-044');
    accounts.rows.delete(other.id);
    // La transacción real se revierte entera (prueba de integración); aquí, que el error vuelve y no hay sesión.
    enrollment.enrollResult = err(
      domainError({ code: 'NC-CLI-025', rule: 'RN-B01', message: 'Acepta cada finalidad.' }),
    );
    const refused = await accept(token, { acceptedConsentDocumentIds: ['doc-APP_ACCESS'] });
    expect(isErr(refused) && refused.error.rule).toBe('RN-B01');
    expect(sessions.rows.size).toBe(0);
  });

  it('archivado o vinculado mientras se aceptaba: la invitación ya no sirve', async () => {
    await patients().inviteWithin(STAFF, ORG, PATIENT, 'ana@demo.test');
    enrollment.previewValue = preview();
    enrollment.enrollResult = err(domainError({ code: 'NC-CLI-023', message: 'Ya vinculado.' }));
    const raced = await accept(lastToken());
    expect(isErr(raced) && raced.error.code).toBe('NC-IAM-040');
    expect(enrollment.enrolled).toHaveLength(1);
    expect(sessions.rows.size).toBe(0);
  });
});

describe('RN-A08 y RN-B02 · sesión del paciente', () => {
  const login = () =>
    new LoginHandler(
      uow,
      clock,
      fakeIds,
      audit,
      accounts,
      sessions,
      hasher,
      tokens,
      membershipsOf([]),
      enrollment,
    );
  const command = (email: string) => ({
    email,
    password: PASSWORD,
    currentTokenHash: null,
    ip: null,
    userAgent: null,
  });

  it('una cuenta vinculada a un paciente con acceso entra como PATIENT en su organización', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    enrollment.patient = { patientId: PATIENT, organizationId: ORG, hasAccess: true };
    const opened = await login().execute(command(account.email));
    expect(isOk(opened) && opened.value).toMatchObject({
      kind: 'PATIENT',
      activeOrganizationId: ORG,
    });
  });

  it('sin APP_ACCESS o HEALTH_DATA vigentes, o archivado, entrar responde acceso suspendido y queda auditado', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    enrollment.patient = { patientId: PATIENT, organizationId: ORG, hasAccess: false };
    const refused = await login().execute(command(account.email));
    expect(isErr(refused) && refused.error).toMatchObject({ code: 'NC-IAM-046', rule: 'RN-B02' });
    expect(audit.entries.at(-1)?.entry).toMatchObject({
      action: 'LOGIN_FAILED',
      outcome: 'DENIED',
    });
  });

  it('cada petición resuelve el paciente: sin acceso o en otra organización, la sesión deja de valer', async () => {
    const account = accounts.add({ email: 'ana@demo.test', passwordHash: `h:${PASSWORD}` });
    enrollment.patient = { patientId: PATIENT, organizationId: ORG, hasAccess: true };
    const opened = await login().execute(command(account.email));
    if (!opened.ok) throw new Error(opened.error.code);
    const authenticate = new AuthenticateSessionHandler(uow, clock, sessions, enrollment);
    const hash = tokens.hash(opened.value.token);
    expect(await authenticate.execute(hash)).toMatchObject({ kind: 'PATIENT', patientId: PATIENT });
    enrollment.patient = { patientId: PATIENT, organizationId: ORG, hasAccess: false };
    expect(await authenticate.execute(hash)).toBeNull();
    enrollment.patient = {
      patientId: PATIENT,
      organizationId: '0192f0a0-0000-7000-8000-00000000000b' as OrganizationId,
      hasAccess: true,
    };
    expect(await authenticate.execute(hash)).toBeNull();
    enrollment.patient = null;
    expect(await authenticate.execute(hash)).toBeNull();
  });
});
