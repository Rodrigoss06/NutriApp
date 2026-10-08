import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  systemContext,
  CLOCK,
  domainError,
  ENCRYPTION_PORT,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type EncryptionPort,
  type IdGenerator,
  type Outbox,
  type Result,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { normalizeEmail } from '../../domain/login-policy.js';
import { checkNewPassword, normalizePassword } from '../../domain/password-policy.js';
import { newSessionExpiry } from '../../domain/session-policy.js';
import { accountContext } from '../iam-context.js';
import { passwordChanged, resetRequested, resetTokenAad } from '../iam-events.js';
import {
  ACCOUNT_STORE,
  COMMON_PASSWORDS,
  PASSWORD_HASHER,
  PASSWORD_RESET_STORE,
  SECRET_TOKENS,
  SESSION_STORE,
  type AccountStore,
  type CommonPasswords,
  type PasswordHasher,
  type PasswordResetStore,
  type SecretTokens,
  type SessionStore,
} from '../ports/iam.ports.js';
import type { OpenedSession } from './login.handler.js';

/** El enlace de recuperación vale una hora; el de bienvenida de un administrador de plataforma, 24. */
export const RESET_TTL_MS = 60 * 60 * 1000;
export const WELCOME_TTL_MS = 24 * 60 * 60 * 1000;

export const ACCOUNT_EXISTS = domainError({
  code: 'NC-IAM-012',
  message: 'Ya existe una cuenta con ese correo.',
});

export const WRONG_CURRENT_PASSWORD = domainError({
  code: 'NC-IAM-011',
  message: 'La contraseña actual no es correcta.',
});

export const INVALID_RESET_LINK = domainError({
  code: 'NC-IAM-030',
  message: 'El enlace venció o ya se usó. Pide otro desde «Olvidé mi contraseña».',
});

/**
 * Cambiar y recuperar la contraseña (RN-A07, RN-A08). Cambiarla pide la actual, revoca todas las sesiones y abre
 * una nueva en este equipo; recuperarla las revoca todas y no inicia sesión. En los dos casos se avisa por correo.
 */
@Injectable()
export class PasswordHandlers {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(PASSWORD_RESET_STORE) private readonly resets: PasswordResetStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(COMMON_PASSWORDS) private readonly common: CommonPasswords,
    @Inject(SECRET_TOKENS) private readonly tokens: SecretTokens,
  ) {}

  async change(
    userId: UserId,
    currentSession: {
      kind: OpenedSession['kind'];
      activeOrganizationId: OpenedSession['activeOrganizationId'];
    },
    input: {
      currentPassword: string;
      newPassword: string;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<Result<OpenedSession, DomainError>> {
    const now = this.clock.now();
    const account = await this.uow.query(accountContext(userId), () =>
      this.accounts.findById(userId),
    );
    if (!account?.passwordHash) return err(WRONG_CURRENT_PASSWORD);
    if (
      !(await this.hasher.verify(account.passwordHash, normalizePassword(input.currentPassword)))
    ) {
      return err(WRONG_CURRENT_PASSWORD);
    }
    const policy = checkNewPassword(input.newPassword, {
      email: account.email,
      isCommon: (p) => this.common.has(p),
    });
    if (policy) return err(policy);

    const passwordHash = await this.hasher.hash(normalizePassword(input.newPassword));
    const { token, hash } = this.tokens.generate();
    const sessionId = this.ids.newId<'SessionId'>();
    const expiry = newSessionExpiry(currentSession.kind, now);
    await this.uow.run(accountContext(userId), async () => {
      await this.accounts.setPassword(userId, passwordHash, now);
      await this.sessions.revokeAll(userId, now);
      await this.resets.invalidatePending(userId, now);
      await this.sessions.create({
        id: sessionId,
        userId,
        tokenHash: hash,
        kind: currentSession.kind,
        activeOrganizationId: currentSession.activeOrganizationId,
        now,
        ...expiry,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      await this.outbox.append([passwordChanged(userId, 'CHANGED', this.#events())]);
    });
    return ok({
      token,
      sessionId,
      userId,
      kind: currentSession.kind,
      activeOrganizationId: currentSession.activeOrganizationId,
      absoluteExpiresAt: expiry.absoluteExpiresAt,
    });
  }

  /**
   * Pedir el enlace: responde igual exista o no la cuenta. Solo las cuentas ACTIVE reciben enlace; el pedido nuevo
   * invalida los pendientes. El correo lo envía el worker con el token cifrado del evento (ADR-032).
   */
  async requestReset(email: string): Promise<void> {
    const now = this.clock.now();
    const account = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(normalizeEmail(email)),
    );
    if (account?.status !== 'ACTIVE') return;
    const resetId = this.ids.newId<'PasswordResetId'>();
    const { token, hash } = this.tokens.generate();
    const encryptedToken = Buffer.from(
      this.encryption.encrypt(token, resetTokenAad(resetId)),
    ).toString('base64');
    await this.uow.run(accountContext(account.id), async () => {
      await this.resets.invalidatePending(account.id, now);
      await this.resets.create({
        id: resetId,
        userId: account.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      });
      await this.outbox.append([resetRequested(resetId, encryptedToken, this.#events())]);
    });
  }

  /**
   * Primer PLATFORM_ADMIN de un entorno (CLI): cuenta sin contraseña y enlace de 24 horas por correo para fijarla.
   * Nadie más ve ni elige su contraseña.
   */
  async createPlatformAdmin(
    email: string,
    displayName: string,
  ): Promise<Result<void, DomainError>> {
    const now = this.clock.now();
    const normalized = normalizeEmail(email);
    const existing = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(normalized),
    );
    if (existing) return err(ACCOUNT_EXISTS);
    const userId = this.ids.newId<'UserId'>();
    const resetId = this.ids.newId<'PasswordResetId'>();
    const { token, hash } = this.tokens.generate();
    const encryptedToken = Buffer.from(
      this.encryption.encrypt(token, resetTokenAad(resetId)),
    ).toString('base64');
    await this.uow.run(systemContext(), async () => {
      await this.accounts.createPlatformAdmin({ id: userId, email: normalized, displayName, now });
      await this.resets.create({
        id: resetId,
        userId,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + WELCOME_TTL_MS),
      });
      await this.outbox.append([resetRequested(resetId, encryptedToken, this.#events(), true)], {
        actorRole: 'SYSTEM',
      });
    });
    return ok(undefined);
  }

  /** Fijar la contraseña con el enlace: un solo uso con UPDATE condicional; revoca todas las sesiones. */
  async confirmReset(token: string, newPassword: string): Promise<Result<void, DomainError>> {
    const now = this.clock.now();
    const pending = await this.uow.query(anonymousContext(), () =>
      this.resets.findPending(this.tokens.hash(token), now),
    );
    if (!pending) return err(INVALID_RESET_LINK);
    const account = await this.uow.query(accountContext(pending.userId), () =>
      this.accounts.findById(pending.userId),
    );
    if (account?.status !== 'ACTIVE') return err(INVALID_RESET_LINK);
    const policy = checkNewPassword(newPassword, {
      email: account.email,
      isCommon: (p) => this.common.has(p),
    });
    if (policy) return err(policy);

    const passwordHash = await this.hasher.hash(normalizePassword(newPassword));
    return this.uow.run(accountContext(account.id), async () => {
      if (!(await this.resets.consume(pending.id, now))) return err(INVALID_RESET_LINK);
      await this.accounts.setPassword(account.id, passwordHash, now);
      await this.resets.invalidatePending(account.id, now);
      await this.sessions.revokeAll(account.id, now);
      await this.outbox.append([passwordChanged(account.id, 'RESET', this.#events())]);
      return ok(undefined);
    });
  }

  #events() {
    return { clock: this.clock, ids: this.ids };
  }
}
