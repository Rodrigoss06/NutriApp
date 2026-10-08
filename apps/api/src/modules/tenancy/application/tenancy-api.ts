import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  type Clock,
  type DomainError,
  type EventMetadata,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type UserId,
} from '@nutricoach/shared-kernel';
import { settingValue } from '../domain/settings.js';
import {
  checkCapacity,
  NO_ACTIVE_SUBSCRIPTION,
  type MemberRole,
  type Profession,
} from '../domain/tenancy-rules.js';
import { tenancyEvent } from './tenancy-events.js';
import { ALREADY_MEMBER } from './tenancy-errors.js';
import {
  TENANCY_STORE,
  type OrganizationRecord,
  type TenancyStore,
} from './ports/tenancy.ports.js';

/**
 * API pública de tenancy para otros contextos (02 §3, Open Host Service). Se llama DENTRO de la transacción de su
 * caso de uso: no abre otra. Los cupos toman el candado de la organización antes de contar.
 */
@Injectable()
export class TenancyApi {
  constructor(
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** Candado de la organización para el resto de la transacción (RN-A03, RN-A04). */
  lockOrganization(organizationId: OrganizationId): Promise<void> {
    return this.store.lockOrganization(organizationId);
  }

  /**
   * QuotaPolicy para clinical (RN-A03): toma el candado, cuenta con la función que recibe y compara con el límite
   * congelado de la suscripción activa.
   */
  async ensurePatientCapacity(
    organizationId: OrganizationId,
    countActivePatients: () => Promise<number>,
  ): Promise<Result<void, DomainError>> {
    await this.store.lockOrganization(organizationId);
    const subscription = await this.store.activeSubscription(organizationId);
    if (!subscription) return err(NO_ACTIVE_SUBSCRIPTION);
    const error = checkCapacity(
      'PATIENTS',
      await countActivePatients(),
      subscription.maxActivePatients,
    );
    return error ? err(error) : ok(undefined);
  }

  /**
   * Cupo de staff al invitar: todo el staff activo (OWNER, ADMIN y PROFESSIONAL) más las invitaciones pendientes.
   * Toma el candado de la organización.
   */
  async ensureStaffCapacity(
    organizationId: OrganizationId,
    pendingInvitations: number,
  ): Promise<Result<void, DomainError>> {
    await this.store.lockOrganization(organizationId);
    const subscription = await this.store.activeSubscription(organizationId);
    if (!subscription) return err(NO_ACTIVE_SUBSCRIPTION);
    const occupied = (await this.store.countActiveMembers(organizationId)) + pendingInvitations;
    const error = checkCapacity('STAFF', occupied, subscription.maxProfessionals);
    return error ? err(error) : ok(undefined);
  }

  /** Miembro activo o suspendido: invitarlo de nuevo es 409; quitado, puede volver por invitación. */
  async isMember(organizationId: OrganizationId, userId: UserId): Promise<boolean> {
    const member = await this.store.findMemberByUser(organizationId, userId);
    return member !== null && member.status !== 'REMOVED';
  }

  /**
   * Alta de un miembro al aceptar su invitación (síncrona, 02 §8): candado, cupo con los miembros activos + 1 (sin
   * contar las demás pendientes) y miembro nuevo o reactivado si lo habían quitado.
   */
  async addMemberFromInvitation(
    input: {
      organizationId: OrganizationId;
      userId: UserId;
      role: MemberRole;
      profession: Profession | null;
    },
    metadata: EventMetadata,
  ): Promise<Result<void, DomainError>> {
    await this.store.lockOrganization(input.organizationId);
    const existing = await this.store.findMemberByUser(input.organizationId, input.userId);
    if (existing && existing.status !== 'REMOVED') return err(ALREADY_MEMBER);
    const subscription = await this.store.activeSubscription(input.organizationId);
    if (!subscription) return err(NO_ACTIVE_SUBSCRIPTION);
    const error = checkCapacity(
      'STAFF',
      await this.store.countActiveMembers(input.organizationId),
      subscription.maxProfessionals,
    );
    if (error) return err(error);

    let memberId: string;
    if (existing) {
      memberId = existing.id;
      await this.store.updateMember(existing.id, {
        role: input.role,
        status: 'ACTIVE',
        profession: input.profession,
      });
    } else {
      memberId = this.ids.newId<'MemberId'>();
      await this.store.insertMember({
        id: memberId,
        ...input,
        status: 'ACTIVE',
        licenseNumber: null,
        title: null,
      });
    }
    await this.outbox.append(
      [
        tenancyEvent(
          'tenancy.member.added',
          input.organizationId,
          memberId,
          { role: input.role },
          {
            clock: this.clock,
            ids: this.ids,
          },
        ),
      ],
      metadata,
    );
    return ok(undefined);
  }

  organization(organizationId: OrganizationId): Promise<OrganizationRecord | null> {
    return this.store.findOrganization(organizationId);
  }

  async invitationTtlDays(organizationId: OrganizationId): Promise<number> {
    return settingValue(
      'invitation.ttl_days',
      await this.store.getSetting(organizationId, 'invitation.ttl_days'),
    );
  }
}
