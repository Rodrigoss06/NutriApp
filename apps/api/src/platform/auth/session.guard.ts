import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../http/problem.js';
import type { ContextualRequest } from '../http/request-context.js';
import { ACCESS_RULE, type AccessRule } from './access.js';
import { SESSION_AUTHENTICATOR, type SessionAuthenticator } from './session-authenticator.port.js';
import { hashToken, readSessionToken } from './session-cookie.js';

export const UNAUTHENTICATED = {
  title: 'Tu sesión no es válida. Vuelve a entrar.',
  code: 'NC-IAM-020',
} as const;

/**
 * Primera guardia de la cadena (02 §10): cada ruta declara su regla (se niega por defecto) y, salvo las públicas,
 * exige una cookie de sesión válida. Fija `session` y un contexto de cuenta; TenantGuard agrega la organización.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_AUTHENTICATOR) private readonly authenticator: SessionAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      throw new ProblemException(403, { title: 'Ruta sin regla de acceso.', code: 'NC-PLT-011' });
    }
    if (rule.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const token = readSessionToken(request);
    const principal = token ? await this.authenticator.authenticate(hashToken(token)) : null;
    if (!principal) throw new ProblemException(401, UNAUTHENTICATED);

    if (rule.kind === 'platform' && principal.kind !== 'PLATFORM') {
      throw new ProblemException(403, { title: 'Solo para el panel interno.', code: 'NC-PLT-012' });
    }
    request.session = principal;
    request.securityContext = {
      organizationId: null,
      userId: principal.userId,
      role: principal.kind === 'PLATFORM' ? 'PLATFORM_ADMIN' : 'ACCOUNT',
      patientId: principal.patientId,
    };
    return true;
  }
}
