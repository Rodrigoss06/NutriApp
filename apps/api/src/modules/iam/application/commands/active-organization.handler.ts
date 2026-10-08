import { Inject, Injectable } from '@nestjs/common';
import {
  domainError,
  err,
  ok,
  UNIT_OF_WORK,
  type DomainError,
  type OrganizationId,
  type Result,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { accountContext } from '../iam-context.js';
import {
  MEMBERSHIP_DIRECTORY,
  SESSION_STORE,
  type MembershipDirectory,
  type SessionStore,
} from '../ports/iam.ports.js';

/** 404 y no 403: no se confirma que exista una organización donde no eres miembro (06 §5). */
export const NOT_A_MEMBER = domainError({ code: 'NC-IAM-050', message: 'No encontrado.' });

/** Cambiar la organización activa de la sesión STAFF (RF-02): solo a una donde la membresía está activa. */
@Injectable()
export class ActiveOrganizationHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectory,
  ) {}

  async execute(
    session: { sessionId: string; userId: UserId; kind: string },
    organizationId: OrganizationId,
  ): Promise<Result<void, DomainError>> {
    if (session.kind !== 'STAFF') return err(NOT_A_MEMBER);
    const memberships = await this.memberships.membershipsOf(session.userId);
    if (!memberships.some((m) => m.organizationId === organizationId && m.active)) {
      return err(NOT_A_MEMBER);
    }
    await this.uow.run(accountContext(session.userId), () =>
      this.sessions.setActiveOrganization(session.sessionId, organizationId),
    );
    return ok(undefined);
  }
}
