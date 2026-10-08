import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { MemberRole, MemberStatus, Profession } from '../../../domain/tenancy-rules.js';
import type {
  MemberRecord,
  MembershipRecord,
  OrganizationChanges,
  OrganizationRecord,
  OrganizationStatus,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionStatus,
  TenancyStore,
} from '../../../application/ports/tenancy.ports.js';

/** Fecha de PostgreSQL (date) como YYYY-MM-DD: Prisma la trae como medianoche UTC. */
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  taxId: string | null;
  timezone: string;
  status: string;
  patientVisibility: string;
  patientLabel: string;
  version: number;
}

const ORGANIZATION_FIELDS = {
  id: true,
  name: true,
  slug: true,
  legalName: true,
  taxId: true,
  timezone: true,
  status: true,
  patientVisibility: true,
  patientLabel: true,
  version: true,
} as const;

const toOrganization = (row: OrganizationRow): OrganizationRecord => ({
  ...row,
  id: row.id as OrganizationId,
  status: row.status as OrganizationStatus,
  patientVisibility: row.patientVisibility as OrganizationRecord['patientVisibility'],
});

interface MemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  status: string;
  profession: string | null;
}

const MEMBER_FIELDS = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  status: true,
  profession: true,
} as const;

const toMember = (row: MemberRow): MemberRecord => ({
  id: row.id,
  organizationId: row.organizationId as OrganizationId,
  userId: row.userId as UserId,
  role: row.role as MemberRole,
  status: row.status as MemberStatus,
  profession: row.profession as Profession | null,
});

interface PlanRow {
  id: string;
  code: string;
  name: string;
  maxActivePatients: number;
  maxProfessionals: number;
  durationMonths: number;
  priceCents: bigint;
  currency: string;
  isActive: boolean;
}

const toPlan = (row: PlanRow): PlanRecord => ({ ...row, priceCents: Number(row.priceCents) });

/** tenancy con la transacción de la UnitOfWork. La RLS acota cada consulta a la organización del contexto. */
@Injectable()
export class PrismaTenancyStore implements TenancyStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async lockOrganization(organizationId: OrganizationId): Promise<void> {
    await this.db.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tenancy:${organizationId}`}, 0))`;
  }

  async findOrganization(organizationId: OrganizationId): Promise<OrganizationRecord | null> {
    const row = await this.db.tx.organization.findUnique({
      where: { id: organizationId },
      select: ORGANIZATION_FIELDS,
    });
    return row ? toOrganization(row) : null;
  }

  /** Con el contexto PLATFORM_ADMIN la RLS deja ver todas las organizaciones. */
  async slugTaken(slug: string): Promise<boolean> {
    return (await this.db.tx.organization.count({ where: { slug } })) > 0;
  }

  async createOrganization(organization: {
    id: OrganizationId;
    name: string;
    slug: string;
    timezone: string;
  }): Promise<void> {
    await this.db.tx.organization.createMany({ data: [organization] });
  }

  async updateOrganization(
    organizationId: OrganizationId,
    version: number,
    changes: OrganizationChanges,
  ): Promise<boolean> {
    const { count } = await this.db.tx.organization.updateMany({
      where: { id: organizationId, version },
      data: { ...changes, version: { increment: 1 }, updatedAt: new Date() },
    });
    return count === 1;
  }

  async setOrganizationStatus(
    organizationId: OrganizationId,
    status: OrganizationStatus,
    onlyFrom?: OrganizationStatus,
  ): Promise<boolean> {
    const { count } = await this.db.tx.organization.updateMany({
      where: { id: organizationId, ...(onlyFrom ? { status: onlyFrom } : {}) },
      data: { status, updatedAt: new Date() },
    });
    return count === 1;
  }

  async listMembers(organizationId: OrganizationId): Promise<readonly MemberRecord[]> {
    const rows = await this.db.tx.member.findMany({
      where: { organizationId },
      select: MEMBER_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMember);
  }

  async findMember(organizationId: OrganizationId, memberId: string): Promise<MemberRecord | null> {
    const row = await this.db.tx.member.findFirst({
      where: { id: memberId, organizationId },
      select: MEMBER_FIELDS,
    });
    return row ? toMember(row) : null;
  }

  async findMemberByUser(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<MemberRecord | null> {
    const row = await this.db.tx.member.findFirst({
      where: { organizationId, userId },
      select: MEMBER_FIELDS,
    });
    return row ? toMember(row) : null;
  }

  countActiveMembers(organizationId: OrganizationId): Promise<number> {
    return this.db.tx.member.count({ where: { organizationId, status: 'ACTIVE' } });
  }

  countActiveOwners(organizationId: OrganizationId): Promise<number> {
    return this.db.tx.member.count({ where: { organizationId, status: 'ACTIVE', role: 'OWNER' } });
  }

  async insertMember(member: MemberRecord): Promise<void> {
    await this.db.tx.member.createMany({
      data: [
        {
          id: member.id,
          organizationId: member.organizationId,
          userId: member.userId,
          role: member.role,
          status: member.status,
          profession: member.profession,
        },
      ],
    });
  }

  async updateMember(
    memberId: string,
    changes: { role?: MemberRole; status?: MemberStatus; profession?: Profession | null },
  ): Promise<void> {
    await this.db.tx.member.updateMany({
      where: { id: memberId },
      data: { ...changes, updatedAt: new Date() },
    });
  }

  async activeSubscription(organizationId: OrganizationId): Promise<SubscriptionRecord | null> {
    const row = await this.db.tx.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      select: {
        id: true,
        organizationId: true,
        status: true,
        startsOn: true,
        endsOn: true,
        maxActivePatients: true,
        maxProfessionals: true,
        priceCents: true,
        currency: true,
        subscriptionPlan: { select: { code: true, name: true } },
      },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId as OrganizationId,
          planCode: row.subscriptionPlan.code,
          planName: row.subscriptionPlan.name,
          status: row.status as SubscriptionStatus,
          startsOn: isoDate(row.startsOn),
          endsOn: isoDate(row.endsOn),
          maxActivePatients: row.maxActivePatients,
          maxProfessionals: row.maxProfessionals,
          priceCents: Number(row.priceCents),
          currency: row.currency,
        }
      : null;
  }

  async insertSubscription(subscription: {
    id: string;
    organizationId: OrganizationId;
    plan: PlanRecord;
    startsOn: string;
    endsOn: string;
    changedBy: UserId;
    reason: string | null;
  }): Promise<void> {
    const { plan } = subscription;
    await this.db.tx.subscription.createMany({
      data: [
        {
          id: subscription.id,
          organizationId: subscription.organizationId,
          planId: plan.id,
          status: 'ACTIVE',
          startsOn: asDate(subscription.startsOn),
          endsOn: asDate(subscription.endsOn),
          priceCents: BigInt(plan.priceCents),
          currency: plan.currency,
          maxActivePatients: plan.maxActivePatients,
          maxProfessionals: plan.maxProfessionals,
          changedBy: subscription.changedBy,
          changeReason: subscription.reason,
        },
      ],
    });
  }

  async setSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    onlyFrom: SubscriptionStatus,
  ): Promise<boolean> {
    const { count } = await this.db.tx.subscription.updateMany({
      where: { id: subscriptionId, status: onlyFrom },
      data: { status },
    });
    return count === 1;
  }

  async findPlanByCode(code: string): Promise<PlanRecord | null> {
    const row = await this.db.tx.subscriptionPlan.findUnique({ where: { code } });
    return row ? toPlan(row) : null;
  }

  async listPlans(): Promise<readonly PlanRecord[]> {
    return (
      await this.db.tx.subscriptionPlan.findMany({ orderBy: { maxActivePatients: 'asc' } })
    ).map(toPlan);
  }

  async getSetting(organizationId: OrganizationId, key: string): Promise<unknown> {
    const row = await this.db.tx.organizationSetting.findUnique({
      where: { organizationId_key: { organizationId, key } },
      select: { value: true },
    });
    return row?.value ?? undefined;
  }

  async setSetting(
    organizationId: OrganizationId,
    key: string,
    value: number,
    updatedBy: UserId,
  ): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO tenancy.organization_setting (organization_id, key, value, updated_by, updated_at)
      VALUES (${organizationId}::uuid, ${key}, to_jsonb(${value}::int), ${updatedBy}::uuid, now())
      ON CONFLICT (organization_id, key) DO UPDATE
        SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  }

  async membership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<MembershipRecord | null> {
    const [row] = await this.#memberships(userId, organizationId);
    return row ?? null;
  }

  membershipsOf(userId: UserId): Promise<readonly MembershipRecord[]> {
    return this.#memberships(userId, null);
  }

  async listOrganizations(): Promise<
    readonly (OrganizationRecord & { subscription: SubscriptionRecord | null })[]
  > {
    const organizations = await this.db.tx.organization.findMany({
      select: ORGANIZATION_FIELDS,
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      organizations.map(async (row) => ({
        ...toOrganization(row),
        subscription: await this.activeSubscription(row.id as OrganizationId),
      })),
    );
  }

  /** Membresías visibles con el contexto actual (member_self y organization member_self, 05 §3). */
  async #memberships(
    userId: UserId,
    organizationId: OrganizationId | null,
  ): Promise<MembershipRecord[]> {
    const rows = await this.db.tx.$queryRaw<
      {
        organization_id: string;
        organization_name: string;
        organization_status: string;
        role: string;
        status: string;
      }[]
    >`
      SELECT m.organization_id, o.name AS organization_name, o.status AS organization_status, m.role, m.status
      FROM tenancy.member m
      JOIN tenancy.organization o ON o.id = m.organization_id
      WHERE m.user_id = ${userId}::uuid
        AND m.status <> 'REMOVED'
        AND (${organizationId}::uuid IS NULL OR m.organization_id = ${organizationId}::uuid)
      ORDER BY o.name`;
    return rows.map((row) => ({
      organizationId: row.organization_id as OrganizationId,
      organizationName: row.organization_name,
      organizationStatus: row.organization_status as OrganizationStatus,
      role: row.role as MemberRole,
      status: row.status as MemberStatus,
    }));
  }
}
