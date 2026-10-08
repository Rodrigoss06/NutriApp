import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type OrganizationId, type UserId } from '@nutricoach/shared-kernel';
import type { MemberProfiles, PendingStaffInvitations } from '../../../tenancy/index.js';
import {
  ACCOUNT_STORE,
  INVITATION_STORE,
  type AccountStore,
  type InvitationStore,
} from '../../application/ports/iam.ports.js';

/** Nombres y correos para la lista de miembros de tenancy: tenancy no guarda datos personales. */
@Injectable()
export class IamMemberProfiles implements MemberProfiles {
  constructor(@Inject(ACCOUNT_STORE) private readonly accounts: AccountStore) {}

  async profiles(
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<string, { displayName: string; email: string }>> {
    const rows = await this.accounts.profiles(userIds);
    return new Map(rows.map((row) => [row.id, { displayName: row.displayName, email: row.email }]));
  }
}

/** Invitaciones de staff vigentes, para el uso del cupo (RN-A03). */
@Injectable()
export class IamPendingStaffInvitations implements PendingStaffInvitations {
  constructor(
    @Inject(INVITATION_STORE) private readonly invitations: InvitationStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  count(organizationId: OrganizationId): Promise<number> {
    return this.invitations.countPendingStaff(organizationId, this.clock.now());
  }
}
