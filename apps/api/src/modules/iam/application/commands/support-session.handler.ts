import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  domainError,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type OrganizationId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { accountContext } from '../iam-context.js';
import {
  MEMBERSHIP_DIRECTORY,
  SESSION_STORE,
  type MembershipDirectory,
  type SessionStore,
  type SupportGrantSummary,
} from '../ports/iam.ports.js';

/** 404: sin un permiso vigente no se confirma nada de esa organización (06 §5, RN-A09). */
export const NO_SUPPORT_GRANT = domainError({
  code: 'NC-IAM-051',
  rule: 'RN-A09',
  message: 'No tienes un permiso de soporte vigente para esa organización.',
});

interface PlatformSession {
  readonly sessionId: string;
  readonly userId: UserId;
  readonly kind: string;
  readonly activeOrganizationId: OrganizationId | null;
}

const supportContext = (userId: UserId, grant: SupportGrantSummary): SecurityContext => ({
  organizationId: grant.organizationId,
  userId,
  role: 'PLATFORM_ADMIN',
  patientId: null,
  supportGrantId: grant.grantId as Id<'SupportGrantId'>,
});

/**
 * Entrar a una organización en modo soporte y salir (RN-A09, ADR-129): la sesión PLATFORM fija la organización activa solo con un
 * permiso del dueño vigente. Entrar y salir quedan en la auditoría de la organización, con el permiso.
 */
@Injectable()
export class SupportSessionHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly directory: MembershipDirectory,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async enter(
    session: PlatformSession,
    organizationId: OrganizationId,
  ): Promise<Result<SupportGrantSummary, DomainError>> {
    if (session.kind !== 'PLATFORM') return err(NO_SUPPORT_GRANT);
    const grant = await this.directory.supportGrant(organizationId, session.userId);
    if (!grant?.available) return err(NO_SUPPORT_GRANT);
    await this.uow.run(accountContext(session.userId), () =>
      this.sessions.setActiveOrganization(session.sessionId, organizationId),
    );
    await this.audit.record(supportContext(session.userId, grant), {
      action: 'LOGIN',
      resourceType: 'support.session',
      resourceId: grant.grantId as Id<string>,
    });
    return ok(grant);
  }

  /** Salir no falla: sin modo soporte, no hace nada; con el permiso vencido, sale igual. */
  async leave(session: PlatformSession): Promise<void> {
    if (session.kind !== 'PLATFORM' || !session.activeOrganizationId) return;
    const grant = await this.directory.supportGrant(session.activeOrganizationId, session.userId);
    await this.uow.run(accountContext(session.userId), () =>
      this.sessions.setActiveOrganization(session.sessionId, null),
    );
    if (grant) {
      await this.audit.record(supportContext(session.userId, grant), {
        action: 'LOGOUT',
        resourceType: 'support.session',
        resourceId: grant.grantId as Id<string>,
      });
    }
  }
}
