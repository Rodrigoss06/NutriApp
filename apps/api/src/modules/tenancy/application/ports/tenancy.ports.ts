import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { MemberRole, MemberStatus, Profession } from '../../domain/tenancy-rules.js';

export type OrganizationStatus = 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'CLOSED';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REPLACED';

export interface OrganizationRecord {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly timezone: string;
  readonly status: OrganizationStatus;
  readonly patientVisibility: 'CARE_TEAM' | 'ORGANIZATION';
  readonly patientLabel: string;
  readonly version: number;
}

export interface OrganizationChanges {
  readonly name?: string;
  readonly legalName?: string | null;
  readonly taxId?: string | null;
  readonly timezone?: string;
  readonly patientLabel?: string;
  readonly patientVisibility?: 'CARE_TEAM' | 'ORGANIZATION';
}

export interface MemberRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: MemberRole;
  readonly status: MemberStatus;
  readonly profession: Profession | null;
  readonly licenseNumber: string | null;
  readonly title: string | null;
}

export interface MemberChanges {
  readonly role?: MemberRole;
  readonly status?: MemberStatus;
  readonly profession?: Profession | null;
  readonly licenseNumber?: string | null;
  readonly title?: string | null;
}

export interface PlanRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly maxActivePatients: number;
  readonly maxProfessionals: number;
  readonly durationMonths: number;
  readonly priceCents: number;
  readonly currency: string;
  readonly isActive: boolean;
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly planCode: string;
  readonly planName: string;
  readonly status: SubscriptionStatus;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly maxActivePatients: number;
  readonly maxProfessionals: number;
  readonly priceCents: number;
  readonly currency: string;
}

export interface MembershipRecord {
  readonly memberId: string;
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  readonly organizationStatus: OrganizationStatus;
  readonly role: MemberRole;
  readonly status: MemberStatus;
}

/** tenancy con la transacción de la UnitOfWork; la RLS limita a la organización del contexto. */
export interface TenancyStore {
  /** pg_advisory_xact_lock de la organización: cupos (RN-A03) y «al menos un dueño» (RN-A04). */
  lockOrganization(organizationId: OrganizationId): Promise<void>;
  findOrganization(organizationId: OrganizationId): Promise<OrganizationRecord | null>;
  slugTaken(slug: string): Promise<boolean>;
  createOrganization(organization: {
    id: OrganizationId;
    name: string;
    slug: string;
    timezone: string;
  }): Promise<void>;
  /** Bloqueo optimista: false si la versión no coincide. */
  updateOrganization(
    organizationId: OrganizationId,
    version: number,
    changes: OrganizationChanges,
  ): Promise<boolean>;
  setOrganizationStatus(
    organizationId: OrganizationId,
    status: OrganizationStatus,
    onlyFrom?: OrganizationStatus,
  ): Promise<boolean>;
  listMembers(organizationId: OrganizationId): Promise<readonly MemberRecord[]>;
  findMember(organizationId: OrganizationId, memberId: string): Promise<MemberRecord | null>;
  findMemberByUser(organizationId: OrganizationId, userId: UserId): Promise<MemberRecord | null>;
  countActiveMembers(organizationId: OrganizationId): Promise<number>;
  countActiveOwners(organizationId: OrganizationId): Promise<number>;
  insertMember(member: MemberRecord): Promise<void>;
  updateMember(memberId: string, changes: MemberChanges): Promise<void>;
  activeSubscription(organizationId: OrganizationId): Promise<SubscriptionRecord | null>;
  insertSubscription(subscription: {
    id: string;
    organizationId: OrganizationId;
    plan: PlanRecord;
    startsOn: string;
    endsOn: string;
    changedBy: UserId;
    reason: string | null;
  }): Promise<void>;
  setSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    onlyFrom: SubscriptionStatus,
  ): Promise<boolean>;
  findPlanByCode(code: string): Promise<PlanRecord | null>;
  listPlans(): Promise<readonly PlanRecord[]>;
  getSetting(organizationId: OrganizationId, key: string): Promise<unknown>;
  setSetting(
    organizationId: OrganizationId,
    key: string,
    value: number,
    updatedBy: UserId,
  ): Promise<void>;
  membership(organizationId: OrganizationId, userId: UserId): Promise<MembershipRecord | null>;
  membershipsOf(userId: UserId): Promise<readonly MembershipRecord[]>;
  /** Plataforma: organizaciones con su suscripción activa, para el panel interno y RN-A02. */
  listOrganizations(): Promise<
    readonly (OrganizationRecord & { subscription: SubscriptionRecord | null })[]
  >;
}

export const TENANCY_STORE = Symbol.for('nutricoach.tenancy.TenancyStore');

/** Nombres y correos de las cuentas: los da iam (tenancy no guarda datos personales). */
export interface MemberProfiles {
  profiles(
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<string, { displayName: string; email: string }>>;
}
export const MEMBER_PROFILES = Symbol.for('nutricoach.tenancy.MemberProfiles');

/** Invitaciones de staff pendientes (no aceptadas, no revocadas, no vencidas): las cuenta iam. */
export interface PendingStaffInvitations {
  count(organizationId: OrganizationId): Promise<number>;
}
export const PENDING_STAFF_INVITATIONS = Symbol.for('nutricoach.tenancy.PendingStaffInvitations');

/** Pacientes activos: los cuenta clinical desde P6; hasta entonces, cero. */
export interface ActivePatientCounter {
  count(organizationId: OrganizationId): Promise<number>;
}
export const ACTIVE_PATIENT_COUNTER = Symbol.for('nutricoach.tenancy.ActivePatientCounter');
