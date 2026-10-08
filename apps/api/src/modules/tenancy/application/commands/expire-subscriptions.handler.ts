import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { settingValue } from '../../domain/settings.js';
import { isPastGrace, localDate } from '../../domain/tenancy-rules.js';
import { tenancyEvent } from '../tenancy-events.js';
import { TENANCY_STORE, type TenancyStore } from '../ports/tenancy.ports.js';

/** Contexto de plataforma del trabajo: la RLS de tenancy da acceso a PLATFORM_ADMIN; nunca app_owner. */
const platformContext = (organizationId: OrganizationId | null): SecurityContext => ({
  organizationId,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
});

/**
 * RN-A02, cada hora en el worker: si la fecha local de la organización ya pasó ends_on + gracia, la suscripción pasa
 * a EXPIRED y la organización a READ_ONLY. Idempotente; la auditoría registra al actor SYSTEM.
 */
@Injectable()
export class ExpireSubscriptionsHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const organizations = await this.uow.query(platformContext(null), () =>
      this.store.listOrganizations(),
    );
    let expired = 0;
    for (const organization of organizations) {
      const subscription = organization.subscription;
      if (subscription?.status !== 'ACTIVE') continue;
      const changed = await this.uow.run(platformContext(organization.id), async () => {
        const graceDays = settingValue(
          'subscription.grace_days',
          await this.store.getSetting(organization.id, 'subscription.grace_days'),
        );
        if (!isPastGrace(subscription.endsOn, graceDays, localDate(now, organization.timezone)))
          return false;
        if (!(await this.store.setSubscriptionStatus(subscription.id, 'EXPIRED', 'ACTIVE')))
          return false;
        await this.store.setOrganizationStatus(organization.id, 'READ_ONLY', 'ACTIVE');
        await this.outbox.append(
          [
            tenancyEvent(
              'tenancy.subscription.expired',
              organization.id,
              subscription.id,
              { endsOn: subscription.endsOn, graceDays },
              {
                clock: this.clock,
                ids: this.ids,
              },
            ),
          ],
          { actorUserId: null, actorRole: 'SYSTEM' },
        );
        return true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }
}
