import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../../../domain/login-policy.js';
import type { SessionKind } from '../../../domain/session-policy.js';
import type {
  AccountRecord,
  AccountStatus,
  AccountStore,
  NewSession,
  PasswordResetStore,
  PendingReset,
  SessionRecord,
  SessionStore,
} from '../../../application/ports/iam.ports.js';

/** Bytes de Prisma 7: Uint8Array sobre su propio ArrayBuffer. */
const bytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(value);

interface AccountRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  status: string;
  isPlatformAdmin: boolean;
  lockedUntil: Date | null;
}

const toAccount = (row: AccountRow): AccountRecord => ({
  id: row.id as UserId,
  email: row.email,
  displayName: row.displayName,
  passwordHash: row.passwordHash,
  status: row.status as AccountStatus,
  isPlatformAdmin: row.isPlatformAdmin,
  lockedUntil: row.lockedUntil,
});

const ACCOUNT_FIELDS = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  status: true,
  isPlatformAdmin: true,
  lockedUntil: true,
} as const;

/** iam.user_account con la transacción de la UnitOfWork. */
@Injectable()
export class PrismaAccountStore implements AccountStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const row = await this.db.tx.userAccount.findUnique({
      where: { email },
      select: ACCOUNT_FIELDS,
    });
    return row ? toAccount(row) : null;
  }

  async findById(id: UserId): Promise<AccountRecord | null> {
    const row = await this.db.tx.userAccount.findUnique({ where: { id }, select: ACCOUNT_FIELDS });
    return row ? toAccount(row) : null;
  }

  /**
   * RN-A07 en un solo UPDATE: con el bloqueo vigente no suma (no hay fila que cumpla el WHERE); vencido, el conteo
   * vuelve a empezar; el quinto fallo bloquea 15 minutos. Sin trabajo programado.
   */
  async recordFailedLogin(id: UserId): Promise<void> {
    await this.db.tx.$executeRaw`
      UPDATE iam.user_account AS u
      SET failed_logins = c.attempts,
          locked_until = CASE WHEN c.attempts >= ${MAX_FAILED_LOGINS}
                              THEN now() + make_interval(mins => ${LOCK_MINUTES}) END,
          updated_at = now()
      FROM (SELECT CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failed_logins + 1 END AS attempts
            FROM iam.user_account WHERE id = ${id}::uuid) AS c
      WHERE u.id = ${id}::uuid AND (u.locked_until IS NULL OR u.locked_until <= now())`;
  }

  async recordSuccessfulLogin(id: UserId, now: Date): Promise<void> {
    await this.db.tx.userAccount.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now },
    });
  }

  async setPassword(id: UserId, passwordHash: string, now: Date): Promise<void> {
    await this.db.tx.userAccount.update({
      where: { id },
      data: { passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: now },
    });
  }

  async setDisplayName(id: UserId, displayName: string, now: Date): Promise<void> {
    await this.db.tx.userAccount.update({ where: { id }, data: { displayName, updatedAt: now } });
  }

  async createActive(account: {
    id: UserId;
    email: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Promise<void> {
    await this.db.tx.userAccount.createMany({
      data: [
        {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          passwordHash: account.passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: account.now,
          createdAt: account.now,
          updatedAt: account.now,
        },
      ],
    });
  }

  async activate(id: UserId, displayName: string, passwordHash: string, now: Date): Promise<void> {
    await this.db.tx.userAccount.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        displayName,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: now,
        failedLogins: 0,
        lockedUntil: null,
        updatedAt: now,
      },
    });
  }

  async createPlatformAdmin(account: {
    id: UserId;
    email: string;
    displayName: string;
    now: Date;
  }): Promise<void> {
    await this.db.tx.userAccount.createMany({
      data: [
        {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          status: 'ACTIVE',
          isPlatformAdmin: true,
          emailVerifiedAt: account.now,
          createdAt: account.now,
          updatedAt: account.now,
        },
      ],
    });
  }

  async profiles(
    ids: readonly UserId[],
  ): Promise<readonly { id: UserId; displayName: string; email: string }[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.tx.userAccount.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, displayName: true, email: true },
    });
    return rows.map((row) => ({ ...row, id: row.id as UserId }));
  }
}

interface SessionRow {
  id: string;
  userId: string;
  kind: string;
  activeOrgId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
}

const toSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  userId: row.userId as UserId,
  kind: row.kind as SessionKind,
  activeOrganizationId: row.activeOrgId as OrganizationId | null,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  idleExpiresAt: row.idleExpiresAt,
  absoluteExpiresAt: row.absoluteExpiresAt,
  revokedAt: row.revokedAt,
  userAgent: row.userAgent,
});

const SESSION_FIELDS = {
  id: true,
  userId: true,
  kind: true,
  activeOrgId: true,
  createdAt: true,
  lastSeenAt: true,
  idleExpiresAt: true,
  absoluteExpiresAt: true,
  revokedAt: true,
  userAgent: true,
} as const;

/** iam.session: solo el hash del token (ADR-009). */
@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async create(session: NewSession): Promise<void> {
    await this.db.tx.session.create({
      data: {
        id: session.id,
        userId: session.userId,
        tokenHash: bytes(session.tokenHash),
        kind: session.kind,
        activeOrgId: session.activeOrganizationId,
        createdAt: session.now,
        lastSeenAt: session.now,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        ip: session.ip,
        userAgent: session.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });
  }

  async findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<(SessionRecord & { accountStatus: AccountStatus }) | null> {
    const row = await this.db.tx.session.findUnique({
      where: { tokenHash: bytes(tokenHash) },
      select: { ...SESSION_FIELDS, userAccount: { select: { status: true } } },
    });
    return row
      ? { ...toSession(row), accountStatus: row.userAccount.status as AccountStatus }
      : null;
  }

  async slide(id: string, lastSeenAt: Date, idleExpiresAt: Date): Promise<void> {
    await this.db.tx.session.update({ where: { id }, data: { lastSeenAt, idleExpiresAt } });
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.db.tx.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeOwned(userId: UserId, id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.tx.session.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  async revokeAll(userId: UserId, now: Date): Promise<number> {
    const { count } = await this.db.tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  async setActiveOrganization(id: string, organizationId: OrganizationId): Promise<void> {
    await this.db.tx.session.updateMany({
      where: { id, revokedAt: null },
      data: { activeOrgId: organizationId },
    });
  }

  async listAlive(userId: UserId, now: Date): Promise<readonly SessionRecord[]> {
    const rows = await this.db.tx.session.findMany({
      where: {
        userId,
        revokedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      select: SESSION_FIELDS,
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map(toSession);
  }
}

/** iam.password_reset: un solo uso con UPDATE condicional. */
@Injectable()
export class PrismaPasswordResetStore implements PasswordResetStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async create(reset: {
    id: string;
    userId: UserId;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.tx.passwordReset.create({
      data: {
        id: reset.id,
        userId: reset.userId,
        tokenHash: bytes(reset.tokenHash),
        expiresAt: reset.expiresAt,
      },
      select: { id: true },
    });
  }

  async invalidatePending(userId: UserId, now: Date): Promise<void> {
    await this.db.tx.passwordReset.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  }

  async findPending(tokenHash: Uint8Array, now: Date): Promise<PendingReset | null> {
    const row = await this.db.tx.passwordReset.findFirst({
      where: { tokenHash: bytes(tokenHash), usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
    return row ? { id: row.id, userId: row.userId as UserId } : null;
  }

  async findPendingById(id: string, now: Date): Promise<PendingReset | null> {
    const row = await this.db.tx.passwordReset.findFirst({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
    return row ? { id: row.id, userId: row.userId as UserId } : null;
  }

  async consume(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.tx.passwordReset.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count === 1;
  }
}
