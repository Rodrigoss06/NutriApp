import { Injectable } from '@nestjs/common';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { MembershipView, TenantDirectory } from '../../../../platform/index.js';
import { DirectoryQueries } from '../../application/queries/organization.queries.js';

/** tenancy implementa el puerto TENANT_DIRECTORY de las guardias y de la cuenta. */
@Injectable()
export class TenancyTenantDirectory implements TenantDirectory {
  constructor(private readonly queries: DirectoryQueries) {}

  membership(organizationId: OrganizationId, userId: UserId): Promise<MembershipView | null> {
    return this.queries.membership(organizationId, userId);
  }

  membershipsOf(userId: UserId): Promise<readonly MembershipView[]> {
    return this.queries.membershipsOf(userId);
  }
}
