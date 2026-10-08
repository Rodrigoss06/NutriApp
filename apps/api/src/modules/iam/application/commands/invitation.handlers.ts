import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  AUDIT_PORT,
  CLOCK,
  domainError,
  ENCRYPTION_PORT,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type EncryptionPort,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  ALREADY_MEMBER,
  checkInvitationRole,
  TenancyApi,
  type MemberRole,
} from '../../../tenancy/index.js';
import { INVALID_CREDENTIALS, isLocked, normalizeEmail } from '../../domain/login-policy.js';
import { checkNewPassword, normalizePassword } from '../../domain/password-policy.js';
import { newSessionExpiry } from '../../domain/session-policy.js';
import {
  invitationAccepted,
  invitationCreated,
  invitationRevoked,
  invitationTokenAad,
} from '../iam-events.js';
import {
  ACCOUNT_STORE,
  COMMON_PASSWORDS,
  INVITATION_STORE,
  PASSWORD_HASHER,
  SECRET_TOKENS,
  SESSION_STORE,
  type AccountRecord,
  type AccountStore,
  type CommonPasswords,
  type InvitationRecord,
  type InvitationStore,
  type PasswordHasher,
  type SecretTokens,
  type SessionStore,
} from '../ports/iam.ports.js';
import type { OpenedSession } from './login.handler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const INVALID_INVITATION = domainError({
  code: 'NC-IAM-040',
  message: 'La invitación venció, ya se usó o fue anulada. Pide una nueva a quien te invitó.',
});
export const ACCOUNT_CANNOT_JOIN = domainError({
  code: 'NC-IAM-041',
  message: 'Esta cuenta no puede unirse a una organización. Escribe a soporte.',
});
export const NAME_REQUIRED = domainError({ code: 'NC-IAM-042', message: 'Escribe tu nombre.' });
export const INVITATION_NOT_FOUND = domainError({ code: 'NC-IAM-043', message: 'No encontrado.' });

/** Error que revierte la transacción de la UnitOfWork y vuelve como Result. */
class Rollback extends Error {
  constructor(readonly error: DomainError) {
    super(error.code);
  }
}

export interface InvitationView {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface InspectedInvitation {
  readonly organizationName: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly accountExists: boolean;
}

export interface AcceptCommand {
  readonly token: string;
  readonly password: string;
  readonly displayName?: string | undefined;
  readonly currentTokenHash: Uint8Array | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

const isPending = (invitation: InvitationRecord, now: Date): boolean =>
  invitation.acceptedAt === null && invitation.revokedAt === null && invitation.expiresAt > now;

/**
 * Invitaciones de staff (RF-01, RF-02, RN-A03). El enlace lleva el token en el fragmento; aquí llega en el cuerpo.
 * Una invitación pendiente por correo y organización: reenviar revoca la anterior y crea otra. Aceptar es una sola
 * transacción en el contexto de la organización: marca el uso, crea o reutiliza la cuenta, da de alta al miembro
 * con el cupo de tenancy y abre la sesión.
 */
@Injectable()
export class InvitationHandlers {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(INVITATION_STORE) private readonly invitations: InvitationStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(COMMON_PASSWORDS) private readonly common: CommonPasswords,
    @Inject(SECRET_TOKENS) private readonly tokens: SecretTokens,
    private readonly tenancy: TenancyApi,
  ) {}

  /** Invitar (o volver a invitar) a un correo. Cupo: staff activo + invitaciones vigentes (RN-A03). */
  invite(
    context: SecurityContext,
    input: { email: string; role: MemberRole },
  ): Promise<Result<{ id: string }, DomainError>> {
    const organizationId = this.#organization(context);
    const roleError = checkInvitationRole(context.role as MemberRole, input.role);
    if (roleError) return Promise.resolve(err(roleError));
    return this.#issue(context, organizationId, normalizeEmail(input.email), input.role);
  }

  /** Reenviar: la anterior queda revocada y sale un enlace nuevo con el plazo completo. */
  async resend(
    context: SecurityContext,
    invitationId: string,
  ): Promise<Result<{ id: string }, DomainError>> {
    const organizationId = this.#organization(context);
    const current = await this.uow.query(context, () => this.invitations.findById(invitationId));
    if (!current || current.role === 'PATIENT' || current.acceptedAt || current.revokedAt) {
      return err(INVITATION_NOT_FOUND);
    }
    const roleError = checkInvitationRole(context.role as MemberRole, current.role);
    if (roleError) return err(roleError);
    return this.#issue(context, organizationId, current.email, current.role);
  }

  revoke(context: SecurityContext, invitationId: string): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    return this.uow.run(context, async () => {
      const current = await this.invitations.findById(invitationId);
      if (!current || current.role === 'PATIENT') return err(INVITATION_NOT_FOUND);
      const roleError = checkInvitationRole(context.role as MemberRole, current.role);
      if (roleError) return err(roleError);
      if (!(await this.invitations.revoke(invitationId, this.clock.now())))
        return err(INVITATION_NOT_FOUND);
      await this.outbox.append(
        [invitationRevoked(organizationId, invitationId, this.#events())],
        this.#metadata(context),
      );
      return ok(undefined);
    });
  }

  async list(context: SecurityContext): Promise<readonly InvitationView[]> {
    const organizationId = this.#organization(context);
    const rows = await this.uow.query(context, () =>
      this.invitations.listPendingStaff(organizationId),
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as MemberRole,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    }));
  }

  /** Lo que la página muestra antes de aceptar. Una invitación que no sirve responde siempre igual. */
  async inspect(token: string): Promise<Result<InspectedInvitation, DomainError>> {
    const now = this.clock.now();
    const invitation = await this.#pending(token, now);
    if (!invitation) return err(INVALID_INVITATION);
    const organization = await this.uow.query(
      this.#joinContext(invitation.organizationId, null),
      () => this.tenancy.organization(invitation.organizationId),
    );
    if (!organization) return err(INVALID_INVITATION);
    const account = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(invitation.email),
    );
    return ok({
      organizationName: organization.name,
      email: invitation.email,
      role: invitation.role as MemberRole,
      accountExists: account?.status === 'ACTIVE' && account.passwordHash !== null,
    });
  }

  /**
   * Aceptar. Con una cuenta ACTIVE del correo invitado, se acepta entrando con su contraseña actual; si no, se crea
   * (o se activa la PENDING) con nombre y contraseña. La cuenta que acepta siempre es la del correo invitado.
   */
  async accept(command: AcceptCommand): Promise<Result<OpenedSession, DomainError>> {
    const now = this.clock.now();
    const password = normalizePassword(command.password);
    const invitation = await this.#pending(command.token, now);
    if (!invitation) return err(INVALID_INVITATION);
    const account = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(invitation.email),
    );

    const prepared = await this.#prepareAccount(
      invitation.email,
      account,
      password,
      command.displayName,
    );
    if (!prepared.ok) return prepared;
    const { userId, write } = prepared.value;

    const { token, hash } = this.tokens.generate();
    const sessionId = this.ids.newId<'SessionId'>();
    const expiry = newSessionExpiry('STAFF', now);
    const context = this.#joinContext(invitation.organizationId, userId);
    try {
      await this.uow.run(context, async () => {
        if (!(await this.invitations.accept(invitation.id, now)))
          throw new Rollback(INVALID_INVITATION);
        await write(now);
        const metadata = { actorUserId: userId, actorRole: 'ACCOUNT' as const };
        const added = await this.tenancy.addMemberFromInvitation(
          {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role as MemberRole,
            profession: null,
          },
          metadata,
        );
        if (!added.ok) throw new Rollback(added.error);
        if (command.currentTokenHash) {
          const previous = await this.sessions.findByTokenHash(command.currentTokenHash);
          if (previous && previous.revokedAt === null) await this.sessions.revoke(previous.id, now);
        }
        await this.accounts.recordSuccessfulLogin(userId, now);
        await this.sessions.create({
          id: sessionId,
          userId,
          tokenHash: hash,
          kind: 'STAFF',
          activeOrganizationId: invitation.organizationId,
          now,
          ...expiry,
          ip: command.ip,
          userAgent: command.userAgent,
        });
        await this.outbox.append(
          [
            invitationAccepted(
              invitation.organizationId,
              { invitationId: invitation.id, userId, role: invitation.role },
              this.#events(),
            ),
          ],
          metadata,
        );
      });
    } catch (error) {
      if (error instanceof Rollback) return err(error.error);
      throw error;
    }
    await this.audit.record(
      { organizationId: null, userId, role: 'ACCOUNT', patientId: null },
      { action: 'LOGIN', resourceType: 'iam.session', resourceId: sessionId },
    );
    return ok({
      token,
      sessionId,
      userId,
      kind: 'STAFF',
      activeOrganizationId: invitation.organizationId,
      absoluteExpiresAt: expiry.absoluteExpiresAt,
    });
  }

  /** Invitar dentro de una transacción ya abierta (la propia o la de backoffice al crear una organización). */
  async issueWithin(
    context: SecurityContext,
    organizationId: OrganizationId,
    email: string,
    role: MemberRole,
  ): Promise<Result<{ id: string }, DomainError>> {
    const now = this.clock.now();
    const account = await this.accounts.findByEmail(email);
    if (account?.isPlatformAdmin) return err(ACCOUNT_CANNOT_JOIN);
    await this.tenancy.lockOrganization(organizationId);
    if (account && (await this.tenancy.isMember(organizationId, account.id)))
      return err(ALREADY_MEMBER);
    const previous = await this.invitations.findPendingByEmail(organizationId, email);
    if (previous) {
      await this.invitations.revoke(previous.id, now);
      await this.outbox.append(
        [invitationRevoked(organizationId, previous.id, this.#events())],
        this.#metadata(context),
      );
    }
    const capacity = await this.tenancy.ensureStaffCapacity(
      organizationId,
      await this.invitations.countPendingStaff(organizationId, now),
    );
    if (!capacity.ok) return capacity;
    const invitationId = this.ids.newId<'InvitationId'>();
    const { token, hash } = this.tokens.generate();
    const encryptedToken = Buffer.from(
      this.encryption.encrypt(token, invitationTokenAad(invitationId)),
    ).toString('base64');
    const ttlDays = await this.tenancy.invitationTtlDays(organizationId);
    await this.invitations.create({
      id: invitationId,
      organizationId,
      email,
      role,
      tokenHash: hash,
      expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
      invitedBy: context.userId as UserId,
    });
    await this.outbox.append(
      [invitationCreated(organizationId, { invitationId, role, encryptedToken }, this.#events())],
      this.#metadata(context),
    );
    return ok({ id: invitationId });
  }

  async #issue(
    context: SecurityContext,
    organizationId: OrganizationId,
    email: string,
    role: MemberRole,
  ): Promise<Result<{ id: string }, DomainError>> {
    try {
      return await this.uow.run(context, async () => {
        const result = await this.issueWithin(context, organizationId, email, role);
        // Un error después de revocar la anterior deshace también esa revocación.
        if (!result.ok) throw new Rollback(result.error);
        return result;
      });
    } catch (error) {
      if (error instanceof Rollback) return err(error.error);
      throw error;
    }
  }

  async #pending(token: string, now: Date): Promise<InvitationRecord | null> {
    const invitation = await this.uow.query(anonymousContext(), () =>
      this.invitations.findByToken(this.tokens.hash(token)),
    );
    return invitation && invitation.role !== 'PATIENT' && isPending(invitation, now)
      ? invitation
      : null;
  }

  /** Valida la cuenta que acepta y prepara su escritura (el hash se calcula fuera de la transacción). */
  async #prepareAccount(
    email: string,
    account: AccountRecord | null,
    password: string,
    displayName: string | undefined,
  ): Promise<Result<{ userId: UserId; write: (now: Date) => Promise<void> }, DomainError>> {
    const now = this.clock.now();
    if (account?.status === 'ACTIVE' && account.passwordHash) {
      if (account.isPlatformAdmin) return err(ACCOUNT_CANNOT_JOIN);
      if (isLocked(account.lockedUntil, now)) {
        await this.hasher.verifyDecoy(password);
        return err(INVALID_CREDENTIALS);
      }
      if (!(await this.hasher.verify(account.passwordHash, password))) {
        await this.uow.run(anonymousContext(), () => this.accounts.recordFailedLogin(account.id));
        return err(INVALID_CREDENTIALS);
      }
      return ok({ userId: account.id, write: () => Promise.resolve() });
    }
    if (account && account.status !== 'PENDING') return err(ACCOUNT_CANNOT_JOIN);
    if (account?.isPlatformAdmin) return err(ACCOUNT_CANNOT_JOIN);
    const name = displayName?.trim();
    if (!name) return err(NAME_REQUIRED);
    const policy = checkNewPassword(password, { email, isCommon: (p) => this.common.has(p) });
    if (policy) return err(policy);
    const passwordHash = await this.hasher.hash(password);
    if (account) {
      return ok({
        userId: account.id,
        write: (at) => this.accounts.activate(account.id, name, passwordHash, at),
      });
    }
    const userId = this.ids.newId<'UserId'>();
    return ok({
      userId,
      write: (at) =>
        this.accounts.createActive({ id: userId, email, displayName: name, passwordHash, now: at }),
    });
  }

  /** Contexto de quien se une: la organización de la invitación, sin rol de miembro todavía. */
  #joinContext(organizationId: OrganizationId, userId: UserId | null): SecurityContext {
    return { organizationId, userId, role: 'ACCOUNT', patientId: null };
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId)
      throw new Error('Caso de uso de organización sin organización activa.');
    return context.organizationId;
  }

  #metadata(context: SecurityContext) {
    return { actorUserId: context.userId, actorRole: context.role };
  }

  #events() {
    return { clock: this.clock, ids: this.ids };
  }
}
