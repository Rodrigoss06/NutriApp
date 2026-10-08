import { Injectable } from '@nestjs/common';
import type {
  DomainError,
  OrganizationId,
  Result,
  SecurityContext,
} from '@nutricoach/shared-kernel';
import type { MemberRole } from '../../tenancy/index.js';
import { normalizeEmail } from '../domain/login-policy.js';
import { InvitationHandlers } from './commands/invitation.handlers.js';
import { PasswordHandlers } from './commands/password.handlers.js';

/** API pública de iam para backoffice y la CLI (02 §3). */
@Injectable()
export class IamApi {
  constructor(
    private readonly invitations: InvitationHandlers,
    private readonly passwords: PasswordHandlers,
  ) {}

  /** Invitar dentro de la transacción del llamador (alta de una organización con su dueño). */
  inviteWithin(
    context: SecurityContext,
    organizationId: OrganizationId,
    email: string,
    role: MemberRole,
  ): Promise<Result<{ id: string }, DomainError>> {
    return this.invitations.issueWithin(context, organizationId, normalizeEmail(email), role);
  }

  createPlatformAdmin(email: string, displayName: string): Promise<Result<void, DomainError>> {
    return this.passwords.createPlatformAdmin(email, displayName);
  }
}
