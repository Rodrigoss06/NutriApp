import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { AUDIT_PORT, type AuditPort, type PatientId } from '@nutricoach/shared-kernel';
import type { Observable } from 'rxjs';
import type { ContextualRequest } from '../http/request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La ruta sin el prefijo de la API ni valores: «/patients/:patientId/evaluations». */
export function supportResource(request: Pick<ContextualRequest, 'route' | 'path'>): string {
  const route = (request.route as { path?: unknown } | undefined)?.path;
  const path = typeof route === 'string' ? route : 'desconocida';
  return `support:${path.replace(/^\/api\/v\d+/, '')}`;
}

/**
 * Toda petición del soporte en modo soporte queda en la auditoría antes de responder (RN-A09, RN-B03; ADR-129): la ruta, sin valores,
 * el paciente si la ruta lo nombra y el permiso con que leyó. Falla cerrado: sin auditoría, no hay respuesta. Las lecturas del
 * expediente que ya se auditaban siguen haciéndolo, también con el permiso.
 */
@Injectable()
export class SupportAuditInterceptor implements NestInterceptor {
  constructor(@Inject(AUDIT_PORT) private readonly audit: AuditPort) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const security = request.securityContext;
    if (!request.support || security?.role !== 'PLATFORM_ADMIN') return next.handle();
    const patientId = (request.params as Record<string, string | undefined>)['patientId'];
    await this.audit.record(security, {
      action: 'READ',
      resourceType: supportResource(request),
      patientId: patientId && UUID.test(patientId) ? (patientId as PatientId) : null,
    });
    return next.handle();
  }
}
