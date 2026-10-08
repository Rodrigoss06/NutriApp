import type { SecurityContext } from '@nutricoach/shared-kernel';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/session-authenticator.port.js';

/**
 * Petición después de las guardias: SessionGuard fija `session` y un `securityContext` de cuenta; TenantGuard lo
 * completa con la organización activa y el rol. La plataforma (idempotencia, auditoría) lo lee de aquí.
 */
export interface ContextualRequest extends Request {
  session?: SessionPrincipal;
  securityContext?: SecurityContext;
}
