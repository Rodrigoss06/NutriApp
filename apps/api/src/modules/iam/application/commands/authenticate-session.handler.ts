import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { isSessionAlive, slideSession } from '../../domain/session-policy.js';
import { SESSION_STORE, type SessionRecord, type SessionStore } from '../ports/iam.ports.js';

/**
 * Valida una sesión en cada petición (RN-A08): no revocada, no vencida y con la cuenta ACTIVE. Desliza la
 * inactividad como mucho una vez por minuto.
 */
@Injectable()
export class AuthenticateSessionHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
  ) {}

  async execute(tokenHash: Uint8Array): Promise<SessionRecord | null> {
    const now = this.clock.now();
    return this.uow.run(anonymousContext(), async () => {
      const session = await this.sessions.findByTokenHash(tokenHash);
      if (!session || session.accountStatus !== 'ACTIVE' || !isSessionAlive(session, now))
        return null;
      const slide = slideSession(session.kind, session, now);
      if (!slide) return session;
      await this.sessions.slide(session.id, slide.lastSeenAt, slide.idleExpiresAt);
      return { ...session, ...slide };
    });
  }
}
