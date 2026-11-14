import { Inject, Injectable } from '@nestjs/common';
import type { Features } from '@nutricoach/contracts';
import { FeatureFlags } from '../../../../platform/index.js';
import {
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type OrganizationId,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  ORGANIZATION_SETTINGS,
  settingValue,
  type SettingKey,
  type SettingValue,
} from '../../domain/settings.js';
import { addDays, type MemberRole } from '../../domain/tenancy-rules.js';
import { SUPPORT_GRANT_STORE, type SupportGrantStore } from '../ports/support-grant.ports.js';
import {
  ACTIVE_PATIENT_COUNTER,
  MEMBER_PROFILES,
  PENDING_STAFF_INVITATIONS,
  TENANCY_STORE,
  type ActivePatientCounter,
  type MemberProfiles,
  type MemberRecord,
  type MembershipRecord,
  type OrganizationRecord,
  type PendingStaffInvitations,
  type SubscriptionRecord,
  type TenancyStore,
} from '../ports/tenancy.ports.js';

export interface MemberView {
  readonly id: string;
  readonly userId: UserId;
  readonly displayName: string;
  /** Solo para OWNER y ADMIN: un PROFESSIONAL ve la lista sin correos. */
  readonly email: string | null;
  readonly role: MemberRole;
  readonly status: 'ACTIVE' | 'SUSPENDED';
  readonly profession: string | null;
}

export interface SubscriptionView {
  readonly subscription: SubscriptionRecord | null;
  readonly graceDays: number;
  /** Primer día de solo lectura si no se renueva (RN-A02). */
  readonly readOnlyFrom: string | null;
  readonly usage: {
    readonly staff: number;
    readonly pendingInvitations: number;
    readonly activePatients: number;
  };
}

/** Lecturas de la organización activa (RF-02, RF-03). */
@Injectable()
export class OrganizationQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(MEMBER_PROFILES) private readonly profiles: MemberProfiles,
    @Inject(PENDING_STAFF_INVITATIONS) private readonly pending: PendingStaffInvitations,
    @Inject(ACTIVE_PATIENT_COUNTER) private readonly patients: ActivePatientCounter,
    @Inject(FeatureFlags) private readonly flags: Pick<FeatureFlags, 'features'>,
  ) {}

  /** La organización activa con sus banderas vigentes (RF-39, ADR-127): la web oculta lo que la API negaría. */
  organization(
    context: SecurityContext,
  ): Promise<(OrganizationRecord & { readonly features: Features }) | null> {
    const organizationId = this.#organization(context);
    return this.uow.query(context, async () => {
      const organization = await this.store.findOrganization(organizationId);
      return organization
        ? { ...organization, features: await this.flags.features(organizationId) }
        : null;
    });
  }

  async members(context: SecurityContext): Promise<readonly MemberView[]> {
    const members = await this.uow.query(context, () =>
      this.store.listMembers(this.#organization(context)),
    );
    const visible = members.filter((m) => m.status !== 'REMOVED');
    const profiles = await this.profiles.profiles(visible.map((m) => m.userId));
    const showEmail = context.role === 'OWNER' || context.role === 'ADMIN';
    return visible.map((member) => ({
      id: member.id,
      userId: member.userId,
      displayName: profiles.get(member.userId)?.displayName ?? '',
      email: showEmail ? (profiles.get(member.userId)?.email ?? null) : null,
      role: member.role,
      status: member.status as 'ACTIVE' | 'SUSPENDED',
      profession: member.profession,
    }));
  }

  /** El miembro de la sesión en la organización activa, con su perfil profesional. */
  ownMember(context: SecurityContext): Promise<MemberRecord | null> {
    const organizationId = this.#organization(context);
    return this.uow.query(context, async () => {
      if (!context.userId) return null;
      const member = await this.store.findMemberByUser(organizationId, context.userId);
      return member?.status === 'ACTIVE' ? member : null;
    });
  }

  subscription(context: SecurityContext): Promise<SubscriptionView> {
    const organizationId = this.#organization(context);
    return this.uow.query(context, async () => {
      const subscription = await this.store.activeSubscription(organizationId);
      const graceDays = settingValue(
        'subscription.grace_days',
        await this.store.getSetting(organizationId, 'subscription.grace_days'),
      );
      return {
        subscription,
        graceDays,
        readOnlyFrom: subscription ? addDays(subscription.endsOn, graceDays + 1) : null,
        usage: {
          staff: await this.store.countActiveMembers(organizationId),
          pendingInvitations: await this.pending.count(organizationId),
          activePatients: await this.patients.count(organizationId),
        },
      };
    });
  }

  settings(context: SecurityContext): Promise<{ readonly [K in SettingKey]: SettingValue<K> }> {
    const organizationId = this.#organization(context);
    return this.uow.query(context, async () => {
      const entries = await Promise.all(
        (Object.keys(ORGANIZATION_SETTINGS) as SettingKey[]).map(
          async (key) =>
            [key, settingValue(key, await this.store.getSetting(organizationId, key))] as const,
        ),
      );
      return Object.fromEntries(entries) as { [K in SettingKey]: SettingValue<K> };
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId)
      throw new Error('Consulta de organización sin organización activa.');
    return context.organizationId;
  }
}

/** Membresías para TenantGuard y para la cuenta (TENANT_DIRECTORY): sin caché, en cada petición. */
@Injectable()
export class DirectoryQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(SUPPORT_GRANT_STORE) private readonly supportGrants: SupportGrantStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * El permiso de soporte vigente de esa persona en esa organización (RN-A09, ADR-129), con el contexto del soporte: la RLS le deja
   * leer solo los suyos. Si tiene los dos alcances, CLINICAL_READ.
   */
  async supportGrant(organizationId: OrganizationId, userId: UserId) {
    const grants = await this.uow.query(
      { organizationId, userId, role: 'PLATFORM_ADMIN', patientId: null },
      () => this.supportGrants.activeOfSupport(userId, organizationId, this.clock.now()),
    );
    const grant = grants.find((g) => g.scope === 'CLINICAL_READ') ?? grants[0];
    return grant
      ? {
          grantId: grant.id,
          organizationId,
          organizationName: grant.organizationName,
          organizationStatus: grant.organizationStatus,
          scope: grant.scope,
          expiresAt: grant.expiresAt,
        }
      : null;
  }

  membership(organizationId: OrganizationId, userId: UserId): Promise<MembershipRecord | null> {
    return this.uow.query({ organizationId, userId, role: 'ACCOUNT', patientId: null }, () =>
      this.store.membership(organizationId, userId),
    );
  }

  membershipsOf(userId: UserId): Promise<readonly MembershipRecord[]> {
    return this.uow.query({ organizationId: null, userId, role: 'ACCOUNT', patientId: null }, () =>
      this.store.membershipsOf(userId),
    );
  }

  /** El estado de la organización de un paciente, con su contexto PATIENT: la RLS le deja ver solo la suya. */
  patientOrganizationStatus(
    organizationId: OrganizationId,
    patient: { readonly userId: UserId; readonly patientId: PatientId },
  ): Promise<OrganizationRecord['status'] | null> {
    return this.uow.query(
      { organizationId, userId: patient.userId, role: 'PATIENT', patientId: patient.patientId },
      async () => (await this.store.findOrganization(organizationId))?.status ?? null,
    );
  }
}
