import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  AUDIT_PORT,
  CLOCK,
  domainError,
  err,
  ID_GENERATOR,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Result,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { INVALID_CREDENTIALS, isLocked, normalizeEmail } from '../../domain/login-policy.js';
import { normalizePassword } from '../../domain/password-policy.js';
import { newSessionExpiry, type SessionKind } from '../../domain/session-policy.js';
import { accountContext } from '../iam-context.js';
import {
  ACCOUNT_STORE,
  MEMBERSHIP_DIRECTORY,
  PASSWORD_HASHER,
  PATIENT_ENROLLMENT,
  SECRET_TOKENS,
  SESSION_STORE,
  type AccountStore,
  type MembershipDirectory,
  type PasswordHasher,
  type PatientEnrollment,
  type SecretTokens,
  type SessionStore,
} from '../ports/iam.ports.js';

/**
 * La cuenta de un paciente sin APP_ACCESS o HEALTH_DATA vigentes, o archivado (RN-B02). Ya verificó su contraseña:
 * decirle por qué no revela nada a un tercero.
 */
export const PATIENT_ACCESS_SUSPENDED = domainError({
  code: 'NC-IAM-046',
  rule: 'RN-B02',
  message: 'Tu acceso a la app está suspendido. Habla con tu profesional.',
});

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
  /** Hash del token de la cookie que llegó, si llegó: esa sesión se revoca antes de crear la nueva. */
  readonly currentTokenHash: Uint8Array | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface OpenedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: UserId;
  readonly kind: SessionKind;
  readonly activeOrganizationId: OrganizationId | null;
  readonly absoluteExpiresAt: Date;
}

/**
 * Entrar (RF-01, RN-A07, RN-A08). Toda falla responde igual y tarda lo mismo: con la cuenta inexistente,
 * pendiente, deshabilitada o bloqueada se verifica un hash señuelo. El bloqueo no suma mientras dura.
 */
@Injectable()
export class LoginHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_TOKENS) private readonly tokens: SecretTokens,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectory,
    @Inject(PATIENT_ENROLLMENT) private readonly enrollment: PatientEnrollment,
  ) {}

  async execute(command: LoginCommand): Promise<Result<OpenedSession, DomainError>> {
    const now = this.clock.now();
    const password = normalizePassword(command.password);
    const account = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(normalizeEmail(command.email)),
    );

    if (
      account?.status !== 'ACTIVE' ||
      !account.passwordHash ||
      isLocked(account.lockedUntil, now)
    ) {
      await this.hasher.verifyDecoy(password);
      await this.#failed(account?.id ?? null);
      return err(INVALID_CREDENTIALS);
    }
    if (!(await this.hasher.verify(account.passwordHash, password))) {
      await this.uow.run(anonymousContext(), () => this.accounts.recordFailedLogin(account.id));
      await this.#failed(account.id);
      return err(INVALID_CREDENTIALS);
    }

    // Una cuenta vinculada a un paciente entra a la app; las demás, al panel (o al panel interno).
    const patient = account.isPlatformAdmin
      ? null
      : await this.uow.query(accountContext(account.id), () => this.enrollment.patientOfAccount());
    if (patient && !patient.hasAccess) {
      await this.#failed(account.id);
      return err(PATIENT_ACCESS_SUSPENDED);
    }
    const kind: SessionKind = account.isPlatformAdmin ? 'PLATFORM' : patient ? 'PATIENT' : 'STAFF';
    const active =
      kind === 'STAFF'
        ? (await this.memberships.membershipsOf(account.id)).filter((m) => m.active)
        : [];
    const activeOrganizationId = patient
      ? patient.organizationId
      : active.length === 1
        ? (active[0]?.organizationId ?? null)
        : null;
    const { token, hash } = this.tokens.generate();
    const sessionId = this.ids.newId<'SessionId'>();
    const expiry = newSessionExpiry(kind, now);

    await this.uow.run(accountContext(account.id), async () => {
      if (command.currentTokenHash) {
        const previous = await this.sessions.findByTokenHash(command.currentTokenHash);
        if (previous && previous.revokedAt === null) await this.sessions.revoke(previous.id, now);
      }
      await this.accounts.recordSuccessfulLogin(account.id, now);
      await this.sessions.create({
        id: sessionId,
        userId: account.id,
        tokenHash: hash,
        kind,
        activeOrganizationId,
        now,
        ...expiry,
        ip: command.ip,
        userAgent: command.userAgent,
      });
    });
    await this.audit.record(accountContext(account.id), {
      action: 'LOGIN',
      resourceType: 'iam.session',
      resourceId: sessionId,
    });
    return ok({
      token,
      sessionId,
      userId: account.id,
      kind,
      activeOrganizationId,
      absoluteExpiresAt: expiry.absoluteExpiresAt,
    });
  }

  /** LOGIN_FAILED sin organización ni correo: solo el id de la cuenta, si existe. */
  async #failed(userId: UserId | null): Promise<void> {
    await this.audit.record(
      { ...anonymousContext(), userId },
      {
        action: 'LOGIN_FAILED',
        resourceType: 'iam.user_account',
        resourceId: userId,
        outcome: 'DENIED',
      },
    );
  }
}
