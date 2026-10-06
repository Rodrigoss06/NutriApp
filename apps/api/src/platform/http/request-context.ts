import type { SecurityContext } from '@nutricoach/shared-kernel';
import type { Request } from 'express';

/**
 * Petición autenticada. SessionGuard y TenantGuard (P5) fijan `securityContext` con el usuario, su rol y la
 * organización activa; la plataforma (idempotencia, auditoría) lo lee de aquí.
 */
export interface ContextualRequest extends Request {
  securityContext?: SecurityContext;
}
