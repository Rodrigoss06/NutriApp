import type { SecurityContext } from '@nutricoach/shared-kernel';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/session-authenticator.port.js';
import type { SupportGrantView } from '../auth/tenant-directory.port.js';

/**
 * Petición después de las guardias: SessionGuard fija `session` y un `securityContext` de cuenta; TenantGuard lo
 * completa con la organización activa y el rol. La plataforma (idempotencia, auditoría) lo lee de aquí.
 */
export interface ContextualRequest extends Request {
  session?: SessionPrincipal;
  securityContext?: SecurityContext;
  /** Solo en modo soporte (RN-A09): el permiso vigente con que lee la persona de la plataforma. Lo fija TenantGuard. */
  support?: SupportGrantView;
}
