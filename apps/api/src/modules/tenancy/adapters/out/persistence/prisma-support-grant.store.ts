import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { SupportGrantRecord, SupportScope } from '../../../domain/support-grant.js';
import type {
  SupportGrantStore,
  SupportGrantWithOrganization,
  SupportStaffMember,
} from '../../../application/ports/support-grant.ports.js';
import type { OrganizationStatus } from '../../../application/ports/tenancy.ports.js';

interface GrantRow {
  id: string;
  organizationId: string;
  supportUserId: string;
  scope: string;
  reason: string;
  grantedBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const toRecord = (row: GrantRow): SupportGrantRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  supportUserId: row.supportUserId,
  scope: row.scope as SupportScope,
  reason: row.reason,
  grantedBy: row.grantedBy,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
});

/** tenancy.support_access_grant (RN-A09, ADR-129): INSERT y UPDATE solo de revoked_at; nunca DELETE. */
@Injectable()
export class PrismaSupportGrantStore implements SupportGrantStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async supportStaff(): Promise<readonly SupportStaffMember[]> {
    const rows = await this.db.tx.$queryRaw<{ user_id: string; display_name: string }[]>`
      SELECT user_id, display_name FROM app.platform_support_directory()`;
    return rows.map((row) => ({ userId: row.user_id, displayName: row.display_name }));
  }

  async insert(grant: SupportGrantRecord): Promise<void> {
    await this.db.tx.supportAccessGrant.createMany({
      data: [
        {
          id: grant.id,
          organizationId: grant.organizationId,
          supportUserId: grant.supportUserId,
          scope: grant.scope,
          reason: grant.reason,
          grantedBy: grant.grantedBy,
          createdAt: grant.createdAt,
          expiresAt: grant.expiresAt,
        },
      ],
    });
  }

  async find(grantId: string): Promise<SupportGrantRecord | null> {
    const row = await this.db.tx.supportAccessGrant.findUnique({ where: { id: grantId } });
    return row ? toRecord(row) : null;
  }

  async activeFor(
    supportUserId: string,
    scope: SupportScope,
    now: Date,
  ): Promise<readonly SupportGrantRecord[]> {
    const rows = await this.db.tx.supportAccessGrant.findMany({
      where: { supportUserId, scope, revokedAt: null, expiresAt: { gt: now } },
    });
    return rows.map(toRecord);
  }

  async revoke(grantId: string, at: Date): Promise<boolean> {
    const { count } = await this.db.tx.supportAccessGrant.updateMany({
      where: { id: grantId, revokedAt: null },
      data: { revokedAt: at },
    });
    return count === 1;
  }

  async list(since: Date, now: Date): Promise<readonly SupportGrantRecord[]> {
    const rows = await this.db.tx.supportAccessGrant.findMany({
      where: {
        OR: [{ createdAt: { gte: since } }, { revokedAt: null, expiresAt: { gt: now } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map(toRecord);
  }

  async activeOfSupport(
    supportUserId: string,
    organizationId: OrganizationId | null,
    now: Date,
  ): Promise<readonly SupportGrantWithOrganization[]> {
    const rows = await this.db.tx.supportAccessGrant.findMany({
      where: {
        supportUserId,
        revokedAt: null,
        expiresAt: { gt: now },
        ...(organizationId ? { organizationId } : {}),
      },
      include: { organization: { select: { name: true, status: true } } },
      orderBy: [{ expiresAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      ...toRecord(row),
      organizationName: row.organization.name,
      organizationStatus: row.organization.status as OrganizationStatus,
    }));
  }
}
