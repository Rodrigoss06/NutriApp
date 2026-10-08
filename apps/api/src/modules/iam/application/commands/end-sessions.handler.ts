import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { accountContext } from '../iam-context.js';
import { SESSION_STORE, type SessionStore } from '../ports/iam.ports.js';

/** Cerrar sesión: la actual, una de la lista o todas (RN-A08). */
@Injectable()
export class EndSessionsHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
  ) {}

  async logout(userId: UserId, sessionId: string): Promise<void> {
    await this.uow.run(accountContext(userId), () =>
      this.sessions.revoke(sessionId, this.clock.now()),
    );
    await this.audit.record(accountContext(userId), {
      action: 'LOGOUT',
      resourceType: 'iam.session',
      resourceId: sessionId as never,
    });
  }

  /** false si la sesión no es del usuario: la API responde 404 sin decir de quién es. */
  revokeOne(userId: UserId, sessionId: string): Promise<boolean> {
    return this.uow.run(accountContext(userId), () =>
      this.sessions.revokeOwned(userId, sessionId, this.clock.now()),
    );
  }

  async revokeAll(userId: UserId): Promise<void> {
    await this.uow.run(accountContext(userId), () =>
      this.sessions.revokeAll(userId, this.clock.now()),
    );
    await this.audit.record(accountContext(userId), {
      action: 'LOGOUT',
      resourceType: 'iam.session',
      changedFields: ['all_sessions'],
    });
  }
}
