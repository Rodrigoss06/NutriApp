import { Injectable } from '@nestjs/common';
import type { SessionAuthenticator, SessionPrincipal } from '../../../../../platform/index.js';
import { AuthenticateSessionHandler } from '../../../application/commands/authenticate-session.handler.js';

/** iam implementa el puerto SESSION_AUTHENTICATOR de las guardias. */
@Injectable()
export class IamSessionAuthenticator implements SessionAuthenticator {
  constructor(private readonly handler: AuthenticateSessionHandler) {}

  async authenticate(tokenHash: Uint8Array): Promise<SessionPrincipal | null> {
    const session = await this.handler.execute(tokenHash);
    return session
      ? {
          sessionId: session.id,
          userId: session.userId,
          kind: session.kind,
          activeOrganizationId: session.activeOrganizationId,
          patientId: null,
        }
      : null;
  }
}
