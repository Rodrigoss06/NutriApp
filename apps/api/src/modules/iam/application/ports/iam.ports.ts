import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { SessionKind } from '../../domain/session-policy.js';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'DISABLED';

export interface AccountRecord {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly isPlatformAdmin: boolean;
  readonly lockedUntil: Date | null;
}

/** Cuentas de iam.user_account (usuarios globales, sin RLS: el acceso lo controla iam). */
export interface AccountStore {
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(id: UserId): Promise<AccountRecord | null>;
  /** RN-A07 en un solo UPDATE atómico: suma un fallo y bloquea al quinto; durante el bloqueo no suma. */
  recordFailedLogin(id: UserId): Promise<void>;
  recordSuccessfulLogin(id: UserId, now: Date): Promise<void>;
  /** Fija el hash y deja failed_logins = 0 y locked_until = NULL. */
  setPassword(id: UserId, passwordHash: string, now: Date): Promise<void>;
  setDisplayName(id: UserId, displayName: string, now: Date): Promise<void>;
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: SessionKind;
  readonly activeOrganizationId: OrganizationId | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly userAgent: string | null;
}

export interface NewSession {
  readonly id: string;
  readonly userId: UserId;
  readonly tokenHash: Uint8Array;
  readonly kind: SessionKind;
  readonly activeOrganizationId: OrganizationId | null;
  readonly now: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface SessionStore {
  create(session: NewSession): Promise<void>;
  /** La sesión del hash con el estado de su cuenta. */
  findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<(SessionRecord & { accountStatus: AccountStatus }) | null>;
  slide(id: string, lastSeenAt: Date, idleExpiresAt: Date): Promise<void>;
  revoke(id: string, now: Date): Promise<void>;
  /** Revoca una sesión del usuario; false si no es suya o ya no existe. */
  revokeOwned(userId: UserId, id: string, now: Date): Promise<boolean>;
  revokeAll(userId: UserId, now: Date): Promise<number>;
  listAlive(userId: UserId, now: Date): Promise<readonly SessionRecord[]>;
}

export interface PendingReset {
  readonly id: string;
  readonly userId: UserId;
}

/** iam.password_reset: un solo uso, con UPDATE condicional. */
export interface PasswordResetStore {
  create(reset: {
    id: string;
    userId: UserId;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }): Promise<void>;
  /** Un pedido nuevo o una contraseña fijada invalidan los pendientes. */
  invalidatePending(userId: UserId, now: Date): Promise<void>;
  findPending(tokenHash: Uint8Array, now: Date): Promise<PendingReset | null>;
  findPendingById(id: string, now: Date): Promise<PendingReset | null>;
  /** Marca el uso solo si sigue pendiente: true si esta petición lo usó. */
  consume(id: string, now: Date): Promise<boolean>;
}

/** argon2id (RNF-13). El hash señuelo iguala el tiempo de respuesta cuando la cuenta no sirve. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  verifyDecoy(password: string): Promise<void>;
}

export interface CommonPasswords {
  has(lowercased: string): boolean;
}

/** Tokens opacos de 256 bits en base64url; solo su SHA-256 se guarda. */
export interface SecretTokens {
  generate(): { readonly token: string; readonly hash: Uint8Array };
  hash(token: string): Uint8Array;
}

export const ACCOUNT_STORE = Symbol.for('nutricoach.iam.AccountStore');
export const SESSION_STORE = Symbol.for('nutricoach.iam.SessionStore');
export const PASSWORD_RESET_STORE = Symbol.for('nutricoach.iam.PasswordResetStore');
export const PASSWORD_HASHER = Symbol.for('nutricoach.iam.PasswordHasher');
export const COMMON_PASSWORDS = Symbol.for('nutricoach.iam.CommonPasswords');
export const SECRET_TOKENS = Symbol.for('nutricoach.iam.SecretTokens');

export interface MembershipSummary {
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  readonly role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL';
  readonly active: boolean;
}

/** Membresías de un usuario, de tenancy (P5, PR 2). Sin tenancy, ninguna. */
export interface MembershipDirectory {
  membershipsOf(userId: UserId): Promise<readonly MembershipSummary[]>;
}

export const MEMBERSHIP_DIRECTORY = Symbol.for('nutricoach.iam.MembershipDirectory');
