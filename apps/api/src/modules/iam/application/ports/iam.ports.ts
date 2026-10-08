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
  /** Cuenta nueva al aceptar una invitación: ACTIVE y con el correo verificado (lo probó el enlace). */
  createActive(account: {
    id: UserId;
    email: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Promise<void>;
  /** Cuenta PENDING (sin contraseña) que acepta: la activa con su nombre, su contraseña y el correo verificado. */
  activate(id: UserId, displayName: string, passwordHash: string, now: Date): Promise<void>;
  /** Administrador de plataforma sin contraseña: la fija con el enlace de bienvenida (24 horas). */
  createPlatformAdmin(account: {
    id: UserId;
    email: string;
    displayName: string;
    now: Date;
  }): Promise<void>;
  profiles(
    ids: readonly UserId[],
  ): Promise<readonly { id: UserId; displayName: string; email: string }[]>;
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
  setActiveOrganization(id: string, organizationId: OrganizationId): Promise<void>;
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

export type InvitationRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'PATIENT';

export interface InvitationRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly email: string;
  readonly role: InvitationRole;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

/**
 * iam.invitation. Con el token, sin contexto, solo por app.find_invitation; el resto con la RLS de la organización.
 * Pendiente = sin aceptar ni revocar (el índice parcial deja una por correo y organización, vencida o no).
 */
export interface InvitationStore {
  create(invitation: {
    id: string;
    organizationId: OrganizationId;
    email: string;
    role: InvitationRole;
    tokenHash: Uint8Array;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void>;
  findByToken(tokenHash: Uint8Array): Promise<InvitationRecord | null>;
  findById(id: string): Promise<(InvitationRecord & { createdAt: Date }) | null>;
  findPendingByEmail(
    organizationId: OrganizationId,
    email: string,
  ): Promise<InvitationRecord | null>;
  listPendingStaff(
    organizationId: OrganizationId,
  ): Promise<readonly (InvitationRecord & { createdAt: Date })[]>;
  /** Pendientes de staff que siguen vigentes: ocupan cupo (RN-A03). */
  countPendingStaff(organizationId: OrganizationId, now: Date): Promise<number>;
  /** UPDATE condicional: true si seguía pendiente. */
  revoke(id: string, now: Date): Promise<boolean>;
  /** Un solo uso: UPDATE condicional (sin aceptar, sin revocar, vigente). true si esta petición la aceptó. */
  accept(id: string, now: Date): Promise<boolean>;
}

export const INVITATION_STORE = Symbol.for('nutricoach.iam.InvitationStore');
