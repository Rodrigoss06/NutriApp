import type { ContextualRequest, SessionPrincipal } from '../../../../../platform/index.js';
import { ProblemException } from '../../../../../platform/index.js';

/** IP real (trust proxy acotado en configureHttp) y agente, recortado. Solo para la sesión y la auditoría. */
export function clientOf(request: ContextualRequest): {
  ip: string | null;
  userAgent: string | null;
} {
  return { ip: request.ip ?? null, userAgent: request.header('user-agent')?.slice(0, 512) ?? null };
}

/** La sesión que fijó SessionGuard; si falta, la ruta está mal declarada. */
export function sessionOf(request: ContextualRequest): SessionPrincipal {
  if (!request.session)
    throw new ProblemException(401, {
      title: 'Tu sesión no es válida. Vuelve a entrar.',
      code: 'NC-IAM-020',
    });
  return request.session;
}
