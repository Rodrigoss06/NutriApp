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
} from '@nutricoach/shared-kernel';
import {
  canRevoke,
  newSupportGrant,
  type SupportGrantRecord,
  type SupportScope,
} from '../../domain/support-grant.js';
import { SUPPORT_GRANT_NOT_FOUND, SUPPORT_USER_NOT_FOUND } from '../tenancy-errors.js';
import { tenancyEvent } from '../tenancy-events.js';
import { SUPPORT_GRANT_STORE, type SupportGrantStore } from '../ports/support-grant.ports.js';

export interface GrantSupportInput {
  readonly supportUserId: string;
  readonly scope: SupportScope;
  readonly reason: string;
  readonly durationDays: number;
}

/**
 * El dueño da y revoca permisos de soporte (RN-A09; ADR-124, ADR-129). Un permiso nuevo para la misma persona y el mismo alcance
 * reemplaza al vigente, que queda revocado. Los dos cambios van a la auditoría por sus eventos, sin el motivo.
 */
@Injectable()
export class SupportGrantCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(SUPPORT_GRANT_STORE) private readonly store: SupportGrantStore,
  ) {}

  grant(
    context: SecurityContext,
    input: GrantSupportInput,
  ): Promise<Result<SupportGrantRecord, DomainError>> {
    const organizationId = organizationOf(context);
    return this.uow.run(context, async () => {
      const staff = await this.store.supportStaff();
      if (!staff.some((member) => member.userId === input.supportUserId)) {
        return err(SUPPORT_USER_NOT_FOUND);
      }
      const now = this.clock.now();
      const created = newSupportGrant(
        {
          id: this.ids.newId<'SupportGrantId'>(),
          organizationId,
          supportUserId: input.supportUserId,
          scope: input.scope,
          reason: input.reason,
          grantedBy: context.userId ?? '',
          durationDays: input.durationDays,
        },
        now,
      );
      if (!created.ok) return created;
      for (const previous of await this.store.activeFor(input.supportUserId, input.scope, now)) {
        await this.store.revoke(previous.id, now);
        await this.#emit(context, 'tenancy.support.revoked', organizationId, previous.id, {
          replacedBy: created.value.id,
        });
      }
      await this.store.insert(created.value);
      await this.#emit(context, 'tenancy.support.granted', organizationId, created.value.id, {
        supportUserId: created.value.supportUserId,
        scope: created.value.scope,
        expiresAt: created.value.expiresAt.toISOString(),
      });
      return ok(created.value);
    });
  }

  revoke(context: SecurityContext, grantId: string): Promise<Result<void, DomainError>> {
    const organizationId = organizationOf(context);
    return this.uow.run(context, async () => {
      const grant = await this.store.find(grantId);
      if (!grant) return err(SUPPORT_GRANT_NOT_FOUND);
      const now = this.clock.now();
      const blocked = canRevoke(grant, now);
      if (blocked) return err(blocked);
      await this.store.revoke(grant.id, now);
      await this.#emit(context, 'tenancy.support.revoked', organizationId, grant.id, {
        replacedBy: null,
      });
      return ok(undefined);
    });
  }

  async #emit(
    context: SecurityContext,
    type: 'tenancy.support.granted' | 'tenancy.support.revoked',
    organizationId: OrganizationId,
    grantId: string,
    payload: object,
  ): Promise<void> {
    await this.outbox.append(
      [tenancyEvent(type, organizationId, grantId, payload, { clock: this.clock, ids: this.ids })],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId) throw new Error('Permiso de soporte sin organización activa.');
  return context.organizationId;
}
