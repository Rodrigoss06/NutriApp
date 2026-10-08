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
import { checkSetting } from '../domain/settings.js';
import { addDays } from '../domain/tenancy-rules.js';
import { PLAN_NOT_FOUND, SLUG_TAKEN } from './tenancy-errors.js';
import { tenancyEvent } from './tenancy-events.js';
import { TENANCY_STORE, type PlanRecord, type TenancyStore } from './ports/tenancy.ports.js';

/** Fin de la vigencia: startsOn + duración en meses − 1 día (vale hasta ends_on inclusive, RN-A02). */
export function subscriptionEndsOn(startsOn: string, durationMonths: number): string {
  const [year = 0, month = 1, day = 1] = startsOn.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  return addDays(end.toISOString().slice(0, 10), -1);
}

/**
 * Operaciones de plataforma sobre tenancy (RF-39), orquestadas por backoffice. Se llaman dentro de su transacción,
 * con el contexto PLATFORM_ADMIN de la organización: la RLS de tenancy les da acceso.
 */
@Injectable()
export class PlatformTenancy {
  constructor(
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async createOrganization(
    input: {
      id: OrganizationId;
      name: string;
      slug: string;
      timezone: string;
      planCode: string;
      startsOn: string;
      actor: UserId;
    },
    metadata: EventMetadata,
  ): Promise<Result<void, DomainError>> {
    const plan = await this.store.findPlanByCode(input.planCode);
    if (!plan?.isActive) return err(PLAN_NOT_FOUND);
    if (await this.store.slugTaken(input.slug)) return err(SLUG_TAKEN);
    await this.store.createOrganization({
      id: input.id,
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
    });
    await this.#subscribe(input.id, plan, input.startsOn, input.actor, 'Alta de la organización');
    await this.outbox.append(
      [this.#event('tenancy.organization.created', input.id, input.id, { planCode: plan.code })],
      metadata,
    );
    return ok(undefined);
  }

  /**
   * Renovar o cambiar de plan: otra suscripción ACTIVE con límites congelados; la anterior, si seguía ACTIVE, pasa a
   * REPLACED. Una organización en solo lectura vuelve a ACTIVE.
   */
  async changeSubscription(
    input: {
      organizationId: OrganizationId;
      planCode: string;
      startsOn: string;
      reason: string | null;
      actor: UserId;
    },
    metadata: EventMetadata,
  ): Promise<Result<void, DomainError>> {
    const plan = await this.store.findPlanByCode(input.planCode);
    if (!plan?.isActive) return err(PLAN_NOT_FOUND);
    await this.store.lockOrganization(input.organizationId);
    const current = await this.store.activeSubscription(input.organizationId);
    if (current) await this.store.setSubscriptionStatus(current.id, 'REPLACED', 'ACTIVE');
    const subscriptionId = await this.#subscribe(
      input.organizationId,
      plan,
      input.startsOn,
      input.actor,
      input.reason,
    );
    await this.store.setOrganizationStatus(input.organizationId, 'ACTIVE', 'READ_ONLY');
    await this.outbox.append(
      [
        this.#event('tenancy.subscription.changed', input.organizationId, subscriptionId, {
          planCode: plan.code,
        }),
      ],
      metadata,
    );
    return ok(undefined);
  }

  async setGraceDays(
    organizationId: OrganizationId,
    value: unknown,
    actor: UserId,
    metadata: EventMetadata,
  ): Promise<Result<void, DomainError>> {
    const error = checkSetting('subscription.grace_days', value, 'PLATFORM');
    if (error) return err(error);
    await this.store.setSetting(organizationId, 'subscription.grace_days', value as number, actor);
    await this.outbox.append(
      [
        this.#event('tenancy.setting.changed', organizationId, organizationId, {
          key: 'subscription.grace_days',
        }),
      ],
      metadata,
    );
    return ok(undefined);
  }

  listOrganizations() {
    return this.store.listOrganizations();
  }

  listPlans() {
    return this.store.listPlans();
  }

  async #subscribe(
    organizationId: OrganizationId,
    plan: PlanRecord,
    startsOn: string,
    actor: UserId,
    reason: string | null,
  ): Promise<string> {
    const id = this.ids.newId<'SubscriptionId'>();
    await this.store.insertSubscription({
      id,
      organizationId,
      plan,
      startsOn,
      endsOn: subscriptionEndsOn(startsOn, plan.durationMonths),
      changedBy: actor,
      reason,
    });
    return id;
  }

  #event(
    type: Parameters<typeof tenancyEvent>[0],
    organizationId: OrganizationId,
    aggregateId: string,
    payload: object,
  ) {
    return tenancyEvent(type, organizationId, aggregateId, payload, {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
