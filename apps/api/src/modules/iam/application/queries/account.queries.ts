import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type OrganizationId,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import type { SessionKind } from '../../domain/session-policy.js';
import { accountContext } from '../iam-context.js';
import {
  ACCOUNT_STORE,
  MEMBERSHIP_DIRECTORY,
  SESSION_STORE,
  type AccountStore,
  type MembershipDirectory,
  type MembershipSummary,
  type SessionStore,
} from '../ports/iam.ports.js';

export interface AccountView {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly kind: SessionKind;
  readonly activeOrganizationId: OrganizationId | null;
  readonly memberships: readonly MembershipSummary[];
}

export interface SessionView {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly userAgent: string | null;
}

/** La propia cuenta y sus sesiones activas (/panel/cuenta). */
@Injectable()
export class AccountQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectory,
  ) {}

  async account(
    userId: UserId,
    session: { kind: SessionKind; activeOrganizationId: OrganizationId | null },
  ): Promise<AccountView | null> {
    const account = await this.uow.query(accountContext(userId), () =>
      this.accounts.findById(userId),
    );
    if (!account) return null;
    const memberships =
      session.kind === 'STAFF' ? await this.memberships.membershipsOf(userId) : [];
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      kind: session.kind,
      activeOrganizationId: session.activeOrganizationId,
      memberships: memberships.filter((membership) => membership.active),
    };
  }

  async sessionsOf(userId: UserId, currentSessionId: string): Promise<readonly SessionView[]> {
    const alive = await this.uow.query(accountContext(userId), () =>
      this.sessions.listAlive(userId, this.clock.now()),
    );
    return alive.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      userAgent: session.userAgent,
    }));
  }
}
