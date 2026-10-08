import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { checkSetting, isSettingKey, INVALID_SETTING } from '../../domain/settings.js';
import {
  checkCapacity,
  checkMemberManagement,
  checkRoleChange,
  LAST_OWNER,
  NO_ACTIVE_SUBSCRIPTION,
  type MemberRole,
  type MemberStatus,
  type Profession,
} from '../../domain/tenancy-rules.js';
import { MEMBER_NOT_FOUND, VERSION_CONFLICT } from '../tenancy-errors.js';
import { tenancyEvent } from '../tenancy-events.js';
import {
  TENANCY_STORE,
  type OrganizationChanges,
  type TenancyStore,
} from '../ports/tenancy.ports.js';

export interface MemberChange {
  readonly role?: MemberRole;
  readonly status?: Exclude<MemberStatus, 'REMOVED'>;
  readonly profession?: Profession | null;
}

/** La organización activa (RF-02): sus datos, sus miembros y sus ajustes. Contexto de TenantGuard. */
@Injectable()
export class OrganizationCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
  ) {}

  update(
    context: SecurityContext,
    version: number,
    changes: OrganizationChanges,
  ): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    return this.uow.run(context, async () => {
      if (!(await this.store.updateOrganization(organizationId, version, changes)))
        return err(VERSION_CONFLICT);
      await this.#emit(context, 'tenancy.organization.updated', organizationId, {
        fields: Object.keys(changes),
      });
      return ok(undefined);
    });
  }

  /**
   * Cambiar rol, estado o profesión de un miembro (RN-A04). Con el candado de la organización: dos dueños que se
   * quitan el rol a la vez no dejan la organización sin dueño. Reactivar vuelve a verificar el cupo (RN-A03).
   */
  changeMember(
    context: SecurityContext,
    memberId: string,
    change: MemberChange,
  ): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    return this.uow.run(context, async () => {
      await this.store.lockOrganization(organizationId);
      const target = await this.store.findMember(organizationId, memberId);
      if (!target || target.status === 'REMOVED') return err(MEMBER_NOT_FOUND);
      const actorRole = context.role as MemberRole;
      const isSelf = target.userId === context.userId;
      const management = checkMemberManagement(actorRole, target.role);
      if (management) return err(management);
      if (change.role && change.role !== target.role) {
        const roleError = checkRoleChange({
          actorRole,
          isSelf,
          currentRole: target.role,
          newRole: change.role,
        });
        if (roleError) return err(roleError);
      }
      const losesOwner =
        target.role === 'OWNER' &&
        target.status === 'ACTIVE' &&
        ((change.role !== undefined && change.role !== 'OWNER') || change.status === 'SUSPENDED');
      if (losesOwner && (await this.store.countActiveOwners(organizationId)) <= 1)
        return err(LAST_OWNER);
      if (change.status === 'ACTIVE' && target.status === 'SUSPENDED') {
        const subscription = await this.store.activeSubscription(organizationId);
        if (!subscription) return err(NO_ACTIVE_SUBSCRIPTION);
        const capacity = checkCapacity(
          'STAFF',
          await this.store.countActiveMembers(organizationId),
          subscription.maxProfessionals,
        );
        if (capacity) return err(capacity);
      }
      await this.store.updateMember(memberId, change);
      await this.#emit(
        context,
        'tenancy.member.changed',
        organizationId,
        { memberId, fields: Object.keys(change) },
        memberId,
      );
      return ok(undefined);
    });
  }

  /** Quitar a un miembro: se conserva la fila como REMOVED. Nunca el último dueño. */
  removeMember(context: SecurityContext, memberId: string): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    return this.uow.run(context, async () => {
      await this.store.lockOrganization(organizationId);
      const target = await this.store.findMember(organizationId, memberId);
      if (!target || target.status === 'REMOVED') return err(MEMBER_NOT_FOUND);
      const management = checkMemberManagement(context.role as MemberRole, target.role);
      if (management) return err(management);
      if (
        target.role === 'OWNER' &&
        target.status === 'ACTIVE' &&
        (await this.store.countActiveOwners(organizationId)) <= 1
      ) {
        return err(LAST_OWNER);
      }
      await this.store.updateMember(memberId, { status: 'REMOVED' });
      await this.#emit(context, 'tenancy.member.removed', organizationId, { memberId }, memberId);
      return ok(undefined);
    });
  }

  /** El perfil profesional propio (profesión, colegiatura y título): cada miembro edita solo el suyo. */
  updateOwnProfile(
    context: SecurityContext,
    profile: { profession: Profession | null; licenseNumber: string | null; title: string | null },
  ): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    return this.uow.run(context, async () => {
      const member = context.userId
        ? await this.store.findMemberByUser(organizationId, context.userId)
        : null;
      if (member?.status !== 'ACTIVE') return err(MEMBER_NOT_FOUND);
      await this.store.updateMember(member.id, profile);
      await this.#emit(
        context,
        'tenancy.member.changed',
        organizationId,
        { memberId: member.id, fields: Object.keys(profile) },
        member.id,
      );
      return ok(undefined);
    });
  }

  /** Ajustes que edita la organización; los de plataforma responden 422. */
  setSetting(
    context: SecurityContext,
    key: string,
    value: unknown,
  ): Promise<Result<void, DomainError>> {
    const organizationId = this.#organization(context);
    if (!isSettingKey(key)) return Promise.resolve(err(INVALID_SETTING(key)));
    const error = checkSetting(key, value, 'ORGANIZATION');
    if (error) return Promise.resolve(err(error));
    return this.uow.run(context, async () => {
      await this.store.setSetting(organizationId, key, value as number, context.userId as UserId);
      await this.#emit(context, 'tenancy.setting.changed', organizationId, { key });
      return ok(undefined);
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId)
      throw new Error('Caso de uso de organización sin organización activa.');
    return context.organizationId;
  }

  async #emit(
    context: SecurityContext,
    type: Parameters<typeof tenancyEvent>[0],
    organizationId: OrganizationId,
    payload: object,
    aggregateId: string = organizationId,
  ): Promise<void> {
    await this.outbox.append(
      [
        tenancyEvent(type, organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      {
        actorUserId: context.userId,
        actorRole: context.role,
      },
    );
  }
}
