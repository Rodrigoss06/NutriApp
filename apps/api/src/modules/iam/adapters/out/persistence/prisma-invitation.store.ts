import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  InvitationRecord,
  InvitationRole,
  InvitationStore,
} from '../../../application/ports/iam.ports.js';

const bytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(value);

interface InvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const INVITATION_FIELDS = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
} as const;

const toInvitation = (row: InvitationRow): InvitationRecord => ({
  ...row,
  organizationId: row.organizationId as OrganizationId,
  role: row.role as InvitationRole,
});

const PENDING = { acceptedAt: null, revokedAt: null } as const;
const STAFF = { role: { not: 'PATIENT' } } as const;

/** iam.invitation con la transacción de la UnitOfWork y la RLS de la organización (RN-A01). */
@Injectable()
export class PrismaInvitationStore implements InvitationStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async create(invitation: {
    id: string;
    organizationId: OrganizationId;
    email: string;
    role: InvitationRole;
    tokenHash: Uint8Array;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void> {
    await this.db.tx.invitation.createMany({
      data: [{ ...invitation, tokenHash: bytes(invitation.tokenHash) }],
    });
  }

  /** Sin contexto de organización: la función SECURITY DEFINER busca por el hash exacto. */
  async findByToken(tokenHash: Uint8Array): Promise<InvitationRecord | null> {
    const [row] = await this.db.tx.$queryRaw<
      {
        id: string;
        organization_id: string;
        email: string;
        role: string;
        expires_at: Date;
        accepted_at: Date | null;
        revoked_at: Date | null;
      }[]
    >`SELECT id, organization_id, email::text AS email, role, expires_at, accepted_at, revoked_at
      FROM app.find_invitation(${bytes(tokenHash)})`;
    return row
      ? toInvitation({
          id: row.id,
          organizationId: row.organization_id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at,
          acceptedAt: row.accepted_at,
          revokedAt: row.revoked_at,
        })
      : null;
  }

  async findById(id: string): Promise<(InvitationRecord & { createdAt: Date }) | null> {
    const row = await this.db.tx.invitation.findUnique({
      where: { id },
      select: { ...INVITATION_FIELDS, createdAt: true },
    });
    return row ? { ...toInvitation(row), createdAt: row.createdAt } : null;
  }

  async findPendingByEmail(
    organizationId: OrganizationId,
    email: string,
  ): Promise<InvitationRecord | null> {
    const row = await this.db.tx.invitation.findFirst({
      where: { organizationId, email, ...PENDING },
      select: INVITATION_FIELDS,
    });
    return row ? toInvitation(row) : null;
  }

  async listPendingStaff(
    organizationId: OrganizationId,
  ): Promise<readonly (InvitationRecord & { createdAt: Date })[]> {
    const rows = await this.db.tx.invitation.findMany({
      where: { organizationId, ...PENDING, ...STAFF },
      select: { ...INVITATION_FIELDS, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({ ...toInvitation(row), createdAt: row.createdAt }));
  }

  countPendingStaff(organizationId: OrganizationId, now: Date): Promise<number> {
    return this.db.tx.invitation.count({
      where: { organizationId, ...PENDING, ...STAFF, expiresAt: { gt: now } },
    });
  }

  async revoke(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.tx.invitation.updateMany({
      where: { id, ...PENDING },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  async accept(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.tx.invitation.updateMany({
      where: { id, ...PENDING, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    return count === 1;
  }
}
