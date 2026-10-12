import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  AUDIT_PORT,
  CLOCK,
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
import { TenancyApi } from '../../../tenancy/index.js';
import {
  ACCOUNT_EXISTS_FOR_PATIENT,
  EMAIL_HAS_PENDING_INVITATION,
  INVALID_INVITATION,
} from '../../domain/invitation-errors.js';
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
  PATIENT_ENROLLMENT,
  SECRET_TOKENS,
  SESSION_STORE,
  type AccountStore,
  type CommonPasswords,
  type InvitationRecord,
  type InvitationStore,
  type PasswordHasher,
  type PatientEnrollment,
  type SecretTokens,
  type SessionStore,
} from '../ports/iam.ports.js';
import type { OpenedSession } from './login.handler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PatientInspection {
  readonly organizationName: string;
  readonly email: string;
  readonly accountExists: boolean;
  readonly consents: readonly {
    id: string;
    purpose: string;
    version: string;
    bodyMarkdown: string;
    provisional: boolean;
  }[];
  /** Menor de 14 con finalidades pendientes: no consiente desde la app; se registra en consulta (⚠️). */
  readonly needsGuardianConsent: boolean;
  readonly firstName: string;
}

export interface PatientAcceptCommand {
  readonly password: string;
  readonly displayName?: string | undefined;
  readonly acceptedConsentDocumentIds: readonly string[];
  readonly currentTokenHash: Uint8Array | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** Error que revierte la transacción de la UnitOfWork y vuelve como Result. */
class Rollback extends Error {
  constructor(readonly error: DomainError) {
    super(error.code);
  }
}

/**
 * Acceso del paciente a la app (RN-A06): invitación de un solo uso con su propio plazo (N22), página de aceptación
 * con una casilla por consentimiento y aceptación en una sola transacción (cuenta, vínculo con el paciente,
 * consentimientos con canal APP y sesión PATIENT). El profesional nunca genera ni conoce contraseñas. En la versión
 * 1.0 una cuenta se vincula a un solo paciente: un correo con cuenta no sirve.
 */
@Injectable()
export class PatientInvitationHandlers {
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
    @Inject(PATIENT_ENROLLMENT) private readonly enrollment: PatientEnrollment,
  ) {}

  /**
   * Invitar dentro de la transacción del caso de uso de clinical, que ya verificó al paciente y al equipo. Reenviar
   * revoca la invitación pendiente del paciente; una invitación se reenvía, no se reactiva (RN-A06).
   */
  async inviteWithin(
    context: SecurityContext,
    organizationId: OrganizationId,
    patientId: string,
    email: string,
  ): Promise<Result<{ id: string }, DomainError>> {
    const now = this.clock.now();
    if (await this.accounts.findByEmail(email)) return err(ACCOUNT_EXISTS_FOR_PATIENT);
    const sameEmail = await this.invitations.findPendingByEmail(organizationId, email);
    if (sameEmail && (sameEmail.role !== 'PATIENT' || sameEmail.patientId !== patientId)) {
      return err(EMAIL_HAS_PENDING_INVITATION);
    }
    const previous = await this.invitations.findPendingForPatient(patientId);
    for (const old of new Map(
      [sameEmail, previous].flatMap((i) => (i ? [[i.id, i] as const] : [])),
    ).values()) {
      await this.invitations.revoke(old.id, now);
      await this.outbox.append(
        [invitationRevoked(organizationId, old.id, this.#events())],
        this.#metadata(context),
      );
    }
    const invitationId = this.ids.newId<'InvitationId'>();
    const { token, hash } = this.tokens.generate();
    const encryptedToken = Buffer.from(
      this.encryption.encrypt(token, invitationTokenAad(invitationId)),
    ).toString('base64');
    const ttlDays = await this.tenancy.patientInvitationTtlDays(organizationId);
    await this.invitations.create({
      id: invitationId,
      organizationId,
      email,
      role: 'PATIENT',
      patientId,
      tokenHash: hash,
      expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
      invitedBy: context.userId as UserId,
    });
    await this.outbox.append(
      [
        invitationCreated(
          organizationId,
          { invitationId, role: 'PATIENT', encryptedToken },
          this.#events(),
        ),
      ],
      this.#metadata(context),
    );
    return ok({ id: invitationId });
  }

  /** La invitación pendiente del paciente (vigente o vencida), dentro de la transacción de quien consulta. */
  async pendingFor(patientId: string): Promise<{ email: string; expiresAt: Date } | null> {
    const invitation = await this.invitations.findPendingForPatient(patientId);
    return invitation ? { email: invitation.email, expiresAt: invitation.expiresAt } : null;
  }

  /** Lo que muestra la página: los textos que faltan aceptar, cada uno con su casilla. */
  async inspect(
    invitation: InvitationRecord,
    tokenHash: Uint8Array,
  ): Promise<Result<PatientInspection, DomainError>> {
    const enrollment = this.enrollment;
    const preview = await this.uow.query(anonymousContext(), () => enrollment.preview(tokenHash));
    if (!preview?.active || preview.linked) return err(INVALID_INVITATION);
    // Un menor de 14 no tiene casillas: la página le explica que el consentimiento se registra en consulta.
    const needsGuardianConsent = preview.needsGuardian && preview.pendingPurposes.length > 0;
    const { organization, texts } = await this.uow.query(
      this.#joinContext(invitation.organizationId, null),
      async () => ({
        organization: await this.tenancy.organization(invitation.organizationId),
        texts: needsGuardianConsent ? [] : await enrollment.consentTexts(preview.pendingPurposes),
      }),
    );
    if (!organization) return err(INVALID_INVITATION);
    const account = await this.uow.query(anonymousContext(), () =>
      this.accounts.findByEmail(invitation.email),
    );
    return ok({
      organizationName: organization.name,
      email: invitation.email,
      accountExists: account !== null,
      consents: texts.map((t) => ({ ...t, provisional: t.version.endsWith('-provisional') })),
      needsGuardianConsent,
      firstName: preview.firstName,
    });
  }

  /**
   * Aceptar: crea la cuenta, la vincula al paciente y registra los consentimientos aceptados (canal APP), todo o nada.
   * APP_ACCESS y HEALTH_DATA son obligatorias; un menor de 14 solo entra si ya se registraron en consulta.
   */
  async accept(
    command: PatientAcceptCommand,
    invitation: InvitationRecord,
    tokenHash: Uint8Array,
  ): Promise<Result<OpenedSession, DomainError>> {
    const enrollment = this.enrollment;
    const now = this.clock.now();
    if (
      await this.uow.query(anonymousContext(), () => this.accounts.findByEmail(invitation.email))
    ) {
      return err(ACCOUNT_EXISTS_FOR_PATIENT);
    }
    const preview = await this.uow.query(anonymousContext(), () => enrollment.preview(tokenHash));
    if (!preview?.active || preview.linked) return err(INVALID_INVITATION);
    const password = normalizePassword(command.password);
    const policy = checkNewPassword(password, {
      email: invitation.email,
      isCommon: (p) => this.common.has(p),
    });
    if (policy) return err(policy);
    const passwordHash = await this.hasher.hash(password);
    const displayName = command.displayName?.trim() || preview.firstName;

    const userId = this.ids.newId<'UserId'>();
    const { token, hash } = this.tokens.generate();
    const sessionId = this.ids.newId<'SessionId'>();
    const expiry = newSessionExpiry('PATIENT', now);
    const metadata = { actorUserId: userId, actorRole: 'ACCOUNT' as const };
    try {
      await this.uow.run(this.#joinContext(invitation.organizationId, userId), async () => {
        if (!(await this.invitations.accept(invitation.id, now)))
          throw new Rollback(INVALID_INVITATION);
        await this.accounts.createActive({
          id: userId,
          email: invitation.email,
          displayName,
          passwordHash,
          now,
        });
        const enrolled = await enrollment.enroll(
          {
            patientId: preview.patientId,
            userId,
            acceptedConsentDocumentIds: command.acceptedConsentDocumentIds,
            ip: command.ip,
            userAgent: command.userAgent,
          },
          metadata,
        );
        // Una regla (RN-B01) vuelve tal cual; archivado o vinculado entretanto: el enlace ya no sirve, sin decir por qué.
        if (!enrolled.ok)
          throw new Rollback(enrolled.error.rule ? enrolled.error : INVALID_INVITATION);
        if (command.currentTokenHash) {
          const previous = await this.sessions.findByTokenHash(command.currentTokenHash);
          if (previous && previous.revokedAt === null) await this.sessions.revoke(previous.id, now);
        }
        await this.accounts.recordSuccessfulLogin(userId, now);
        await this.sessions.create({
          id: sessionId,
          userId,
          tokenHash: hash,
          kind: 'PATIENT',
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
              { invitationId: invitation.id, userId, role: 'PATIENT' },
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
      kind: 'PATIENT',
      activeOrganizationId: invitation.organizationId,
      absoluteExpiresAt: expiry.absoluteExpiresAt,
    });
  }

  /** Contexto de quien acepta: la organización de la invitación y su cuenta, con el rol ACCOUNT (ADR-037). */
  #joinContext(organizationId: OrganizationId, userId: UserId | null): SecurityContext {
    return { organizationId, userId, role: 'ACCOUNT', patientId: null };
  }

  #metadata(context: SecurityContext) {
    return { actorUserId: context.userId, actorRole: context.role };
  }

  #events() {
    return { clock: this.clock, ids: this.ids };
  }
}
