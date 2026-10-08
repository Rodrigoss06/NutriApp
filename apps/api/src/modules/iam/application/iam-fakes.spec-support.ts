import { createHash } from 'node:crypto';
import type {
  OrganizationId,
  AuditEntry,
  AuditPort,
  Clock,
  DomainEvent,
  EncryptionPort,
  IdGenerator,
  Outbox,
  SecurityContext,
  UnitOfWork,
  UserId,
} from '@nutricoach/shared-kernel';
import { asId } from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import type {
  AccountRecord,
  AccountStore,
  CommonPasswords,
  InvitationRecord,
  InvitationRole,
  InvitationStore,
  MembershipDirectory,
  MembershipSummary,
  NewSession,
  PasswordHasher,
  PasswordResetStore,
  PendingReset,
  SecretTokens,
  SessionRecord,
  SessionStore,
} from './ports/iam.ports.js';

/** Puertos falsos en memoria para probar los casos de uso de iam sin base (06 §6). */
export class FakeClock implements Clock {
  current = new Date('2026-10-07T12:00:00Z');
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const fakeIds: IdGenerator = { newId: <T extends string>() => asId<T>(uuidv7()) };

export class FakeUow implements UnitOfWork {
  readonly contexts: SecurityContext[] = [];
  run<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    this.contexts.push(context);
    return work();
  }
  query<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    return this.run(context, work);
  }
}

export class FakeAudit implements AuditPort {
  readonly entries: { context: SecurityContext; entry: AuditEntry }[] = [];
  record(context: SecurityContext, entry: AuditEntry): Promise<void> {
    this.entries.push({ context, entry });
    return Promise.resolve();
  }
}

export class FakeOutbox implements Outbox {
  readonly events: DomainEvent[] = [];
  append(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
}

export const fakeEncryption: EncryptionPort = {
  encrypt: (plaintext, aad) => Buffer.from(`${aad}|${plaintext}`),
  decrypt: (ciphertext, aad) => Buffer.from(ciphertext).toString().replace(`${aad}|`, ''),
  blindIndex: () => new Uint8Array(32),
};

type MutableAccount = { -readonly [K in keyof AccountRecord]: AccountRecord[K] } & {
  failedLogins: number;
};

export class MemoryAccounts implements AccountStore {
  readonly rows = new Map<string, MutableAccount>();
  constructor(private readonly clock: FakeClock) {}

  add(
    account: Partial<AccountRecord> & { email: string; passwordHash?: string | null },
  ): AccountRecord {
    const row: MutableAccount = {
      id: asId<'UserId'>(uuidv7()),
      displayName: 'Persona',
      passwordHash: null,
      status: 'ACTIVE',
      isPlatformAdmin: false,
      lockedUntil: null,
      failedLogins: 0,
      ...account,
    };
    this.rows.set(row.id, row);
    return row;
  }
  findByEmail(email: string) {
    return Promise.resolve(
      [...this.rows.values()].find((r) => r.email.toLowerCase() === email) ?? null,
    );
  }
  findById(id: UserId) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  recordFailedLogin(id: UserId) {
    const row = this.rows.get(id);
    const now = this.clock.now();
    if (row && !(row.lockedUntil && row.lockedUntil > now)) {
      row.failedLogins = row.lockedUntil ? 1 : row.failedLogins + 1;
      row.lockedUntil = row.failedLogins >= 5 ? new Date(now.getTime() + 15 * 60_000) : null;
    }
    return Promise.resolve();
  }
  recordSuccessfulLogin(id: UserId) {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { failedLogins: 0, lockedUntil: null });
    return Promise.resolve();
  }
  setPassword(id: UserId, passwordHash: string) {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { passwordHash, failedLogins: 0, lockedUntil: null });
    return Promise.resolve();
  }
  setDisplayName(id: UserId, displayName: string) {
    const row = this.rows.get(id);
    if (row) row.displayName = displayName;
    return Promise.resolve();
  }
  createActive(account: { id: UserId; email: string; displayName: string; passwordHash: string }) {
    this.add({ ...account, status: 'ACTIVE' });
    return Promise.resolve();
  }
  activate(id: UserId, displayName: string, passwordHash: string) {
    const row = this.rows.get(id);
    if (row?.status === 'PENDING')
      Object.assign(row, { displayName, passwordHash, status: 'ACTIVE' });
    return Promise.resolve();
  }
  createPlatformAdmin(account: { id: UserId; email: string; displayName: string }) {
    this.add({ ...account, status: 'ACTIVE', isPlatformAdmin: true });
    return Promise.resolve();
  }
  profiles(ids: readonly UserId[]) {
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [{ id, displayName: row.displayName, email: row.email }] : [];
      }),
    );
  }
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

export class MemorySessions implements SessionStore {
  readonly rows = new Map<string, SessionRecord & { tokenHash: string }>();
  constructor(private readonly accounts: MemoryAccounts) {}

  create(session: NewSession) {
    this.rows.set(session.id, {
      id: session.id,
      userId: session.userId,
      kind: session.kind,
      activeOrganizationId: session.activeOrganizationId,
      createdAt: session.now,
      lastSeenAt: session.now,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      revokedAt: null,
      userAgent: session.userAgent,
      tokenHash: hex(session.tokenHash),
    });
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: Uint8Array) {
    const row = [...this.rows.values()].find((r) => r.tokenHash === hex(tokenHash));
    const account = row ? this.accounts.rows.get(row.userId) : undefined;
    return Promise.resolve(row && account ? { ...row, accountStatus: account.status } : null);
  }
  slide(id: string, lastSeenAt: Date, idleExpiresAt: Date) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastSeenAt, idleExpiresAt });
    return Promise.resolve();
  }
  revoke(id: string, now: Date) {
    const row = this.rows.get(id);
    if (row && !row.revokedAt) this.rows.set(id, { ...row, revokedAt: now });
    return Promise.resolve();
  }
  revokeOwned(userId: UserId, id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId || row.revokedAt) return Promise.resolve(false);
    this.rows.set(id, { ...row, revokedAt: now });
    return Promise.resolve(true);
  }
  revokeAll(userId: UserId, now: Date) {
    let count = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.revokedAt) {
        this.rows.set(row.id, { ...row, revokedAt: now });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
  listAlive(userId: UserId, now: Date) {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (r) =>
          r.userId === userId && !r.revokedAt && r.idleExpiresAt > now && r.absoluteExpiresAt > now,
      ),
    );
  }
  setActiveOrganization(id: string, organizationId: OrganizationId) {
    const row = this.rows.get(id);
    if (row && !row.revokedAt) this.rows.set(id, { ...row, activeOrganizationId: organizationId });
    return Promise.resolve();
  }
  alive(userId: UserId): number {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.revokedAt).length;
  }
}

export class MemoryResets implements PasswordResetStore {
  readonly rows = new Map<
    string,
    PendingReset & { tokenHash: string; expiresAt: Date; usedAt: Date | null }
  >();
  create(reset: { id: string; userId: UserId; tokenHash: Uint8Array; expiresAt: Date }) {
    this.rows.set(reset.id, { ...reset, tokenHash: hex(reset.tokenHash), usedAt: null });
    return Promise.resolve();
  }
  invalidatePending(userId: UserId, now: Date) {
    for (const row of this.rows.values())
      if (row.userId === userId && !row.usedAt && row.expiresAt > now) row.expiresAt = now;
    return Promise.resolve();
  }
  findPending(tokenHash: Uint8Array, now: Date) {
    const row = [...this.rows.values()].find(
      (r) => r.tokenHash === hex(tokenHash) && !r.usedAt && r.expiresAt > now,
    );
    return Promise.resolve(row ? { id: row.id, userId: row.userId } : null);
  }
  findPendingById(id: string, now: Date) {
    const row = this.rows.get(id);
    return Promise.resolve(
      row && !row.usedAt && row.expiresAt > now ? { id: row.id, userId: row.userId } : null,
    );
  }
  consume(id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.usedAt || row.expiresAt <= now) return Promise.resolve(false);
    row.usedAt = now;
    return Promise.resolve(true);
  }
}

export class FakeHasher implements PasswordHasher {
  decoys = 0;
  hash(password: string) {
    return Promise.resolve(`h:${password}`);
  }
  verify(passwordHash: string, password: string) {
    return Promise.resolve(passwordHash === `h:${password}`);
  }
  verifyDecoy() {
    this.decoys += 1;
    return Promise.resolve();
  }
}

export const fakeCommon = (words: string[] = ['contraseña123']): CommonPasswords => ({
  has: (p) => words.includes(p),
});

export class FakeTokens implements SecretTokens {
  #n = 0;
  generate() {
    this.#n += 1;
    const token = String(this.#n).padStart(43, 'T');
    return { token, hash: this.hash(token) };
  }
  hash(token: string): Uint8Array {
    return createHash('sha256').update(token).digest();
  }
}

export const membershipsOf = (list: MembershipSummary[]): MembershipDirectory => ({
  membershipsOf: () => Promise.resolve(list),
});

export class MemoryInvitations implements InvitationStore {
  readonly rows = new Map<
    string,
    InvitationRecord & {
      tokenHash: string;
      createdAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
    }
  >();
  create(invitation: {
    id: string;
    organizationId: OrganizationId;
    email: string;
    role: InvitationRole;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }) {
    this.rows.set(invitation.id, {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      tokenHash: hex(invitation.tokenHash),
      createdAt: invitation.expiresAt,
      acceptedAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }
  findByToken(tokenHash: Uint8Array) {
    return Promise.resolve(
      [...this.rows.values()].find((r) => r.tokenHash === hex(tokenHash)) ?? null,
    );
  }
  findById(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  #pending(organizationId: OrganizationId) {
    return [...this.rows.values()].filter(
      (r) => r.organizationId === organizationId && !r.acceptedAt && !r.revokedAt,
    );
  }
  findPendingByEmail(organizationId: OrganizationId, email: string) {
    return Promise.resolve(this.#pending(organizationId).find((r) => r.email === email) ?? null);
  }
  listPendingStaff(organizationId: OrganizationId) {
    return Promise.resolve(this.#pending(organizationId).filter((r) => r.role !== 'PATIENT'));
  }
  countPendingStaff(organizationId: OrganizationId, now: Date) {
    return Promise.resolve(
      this.#pending(organizationId).filter((r) => r.role !== 'PATIENT' && r.expiresAt > now).length,
    );
  }
  revoke(id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.acceptedAt || row.revokedAt) return Promise.resolve(false);
    row.revokedAt = now;
    return Promise.resolve(true);
  }
  accept(id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.acceptedAt || row.revokedAt || row.expiresAt <= now)
      return Promise.resolve(false);
    row.acceptedAt = now;
    return Promise.resolve(true);
  }
}
