import { Inject, Injectable } from '@nestjs/common';
import type {
  DomainError,
  OrganizationId,
  Result,
  SecurityContext,
  UserId,
} from '@nutricoach/shared-kernel';
import type { MemberRole } from '../../tenancy/index.js';
import { normalizeEmail } from '../domain/login-policy.js';
import { InvitationHandlers } from './commands/invitation.handlers.js';
import { PasswordHandlers } from './commands/password.handlers.js';
import { PatientInvitationHandlers } from './commands/patient-invitation.handlers.js';
import { ACCOUNT_STORE, type AccountStore } from './ports/iam.ports.js';

/** API pública de iam para backoffice, clinical, la auditoría y la CLI (02 §3). */
@Injectable()
export class IamApi {
  constructor(
    private readonly invitations: InvitationHandlers,
    private readonly patientInvitations: PatientInvitationHandlers,
    private readonly passwords: PasswordHandlers,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
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

  /** Invitar a un paciente a la app dentro de la transacción de clinical (RN-A06). */
  invitePatientWithin(
    context: SecurityContext,
    organizationId: OrganizationId,
    patientId: string,
    email: string,
  ): Promise<Result<{ id: string }, DomainError>> {
    return this.patientInvitations.inviteWithin(
      context,
      organizationId,
      patientId,
      normalizeEmail(email),
    );
  }

  /** La invitación pendiente de un paciente, dentro de la transacción del llamador. */
  pendingPatientInvitation(patientId: string): Promise<{ email: string; expiresAt: Date } | null> {
    return this.patientInvitations.pendingFor(patientId);
  }

  /** Nombres de cuentas para mostrar quién actuó (auditoría, RF-06). Sin correos. */
  async displayNames(userIds: readonly UserId[]): Promise<ReadonlyMap<string, string>> {
    const profiles = await this.accounts.profiles(userIds);
    return new Map(profiles.map((p) => [p.id, p.displayName]));
  }

  createPlatformAdmin(email: string, displayName: string): Promise<Result<void, DomainError>> {
    return this.passwords.createPlatformAdmin(email, displayName);
  }
}
