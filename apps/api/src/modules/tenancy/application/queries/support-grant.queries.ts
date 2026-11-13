import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  supportGrantStatus,
  type SupportGrantRecord,
  type SupportGrantStatus,
} from '../../domain/support-grant.js';
import {
  SUPPORT_GRANT_STORE,
  type SupportGrantStore,
  type SupportGrantWithOrganization,
  type SupportStaffMember,
} from '../ports/support-grant.ports.js';

const HISTORY_DAYS = 90;

export interface SupportGrantView extends SupportGrantRecord {
  readonly supportName: string | null;
  readonly status: SupportGrantStatus;
}

/** Los permisos de soporte: los del dueño de su organización y los vigentes del soporte (RN-A09, ADR-129). */
@Injectable()
export class SupportGrantQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SUPPORT_GRANT_STORE) private readonly store: SupportGrantStore,
  ) {}

  /** Los vigentes primero; después los de los últimos 90 días, del más nuevo al más viejo. */
  list(context: SecurityContext): Promise<readonly SupportGrantView[]> {
    return this.uow.query(context, async () => {
      const now = this.clock.now();
      const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
      const [grants, staff] = await Promise.all([
        this.store.list(since, now),
        this.store.supportStaff(),
      ]);
      const names = new Map(staff.map((member) => [member.userId, member.displayName]));
      const views = grants.map((grant) => ({
        ...grant,
        supportName: names.get(grant.supportUserId) ?? null,
        status: supportGrantStatus(grant, now),
      }));
      return [
        ...views.filter((view) => view.status === 'ACTIVE'),
        ...views.filter((view) => view.status !== 'ACTIVE'),
      ];
    });
  }

  staff(context: SecurityContext): Promise<readonly SupportStaffMember[]> {
    return this.uow.query(context, () => this.store.supportStaff());
  }

  /** Los permisos vigentes de una persona de soporte, en todas las organizaciones, para el panel interno. */
  activeOf(userId: UserId): Promise<readonly SupportGrantWithOrganization[]> {
    return this.uow.query(
      { organizationId: null, userId, role: 'PLATFORM_ADMIN', patientId: null },
      () => this.store.activeOfSupport(userId, null, this.clock.now()),
    );
  }
}
