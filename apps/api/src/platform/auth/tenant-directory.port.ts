import type { OrganizationId, PatientId, UserId } from '@nutricoach/shared-kernel';

export type MemberRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type OrganizationStatus = 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'CLOSED';

export interface MembershipView {
  readonly memberId: string;
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  readonly organizationStatus: OrganizationStatus;
  readonly role: MemberRole;
  readonly status: MemberStatus;
}

/**
 * Membresías de un usuario. La implementa tenancy (P5, PR 2); TenantGuard y la cuenta de iam la consultan en
 * cada petición, sin caché: quitar o suspender a un miembro le corta el acceso en la petición siguiente.
 */
export interface TenantDirectory {
  membership(organizationId: OrganizationId, userId: UserId): Promise<MembershipView | null>;
  membershipsOf(userId: UserId): Promise<readonly MembershipView[]>;
  /** El estado de la organización de un paciente, leído con su propio contexto; null si no la ve. */
  patientOrganizationStatus(
    organizationId: OrganizationId,
    patient: { readonly userId: UserId; readonly patientId: PatientId },
  ): Promise<OrganizationStatus | null>;
}

export const TENANT_DIRECTORY = Symbol.for('nutricoach.TenantDirectory');
