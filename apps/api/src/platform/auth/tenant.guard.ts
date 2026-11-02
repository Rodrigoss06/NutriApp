import {
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Id } from '@nutricoach/shared-kernel';
import { ProblemException } from '../http/problem.js';
import type { ContextualRequest } from '../http/request-context.js';
import { ACCESS_RULE, ALLOWED_WHEN_READ_ONLY, type AccessRule } from './access.js';
import {
  TENANT_DIRECTORY,
  type OrganizationStatus,
  type TenantDirectory,
} from './tenant-directory.port.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const UNAVAILABLE = { title: 'La organización no está disponible.', code: 'NC-TEN-013' } as const;
const READ_ONLY = {
  title: 'La suscripción venció: la organización está en solo lectura.',
  code: 'NC-TEN-014',
  rule: 'RN-A02',
} as const;

/**
 * Segunda guardia (02 §10): en las rutas de una organización, sesión STAFF con organización activa y membresía
 * ACTIVE leída en cada petición. SUSPENDED y CLOSED: 403. READ_ONLY (RN-A02): 422 en toda escritura salvo las
 * permitidas. Completa el contexto de seguridad con la organización y el rol. En las rutas del paciente (/me), la
 * organización de su sesión con las mismas reglas de estado.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(TENANT_DIRECTORY) private readonly directory?: TenantDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind === 'patient') return this.#patientOrganization(context);
    if (rule?.kind !== 'tenant') return true;

    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const session = request.session;
    if (session?.kind !== 'STAFF') {
      throw new ProblemException(403, {
        title: 'Esta sección es del panel del profesional.',
        code: 'NC-TEN-010',
      });
    }
    if (!session.activeOrganizationId) {
      throw new ProblemException(403, {
        title: 'Elige con qué organización trabajas.',
        code: 'NC-TEN-011',
      });
    }
    const membership = this.directory
      ? await this.directory.membership(session.activeOrganizationId, session.userId)
      : null;
    if (membership?.status !== 'ACTIVE') {
      throw new ProblemException(403, {
        title: 'Ya no eres miembro de esta organización.',
        code: 'NC-TEN-012',
      });
    }
    this.#ensureStatus(context, request, membership.organizationStatus);
    request.securityContext = {
      organizationId: membership.organizationId,
      userId: session.userId,
      role: membership.role,
      patientId: null,
      memberId: membership.memberId as Id<'MemberId'>,
    };
    return true;
  }

  /** La organización del paciente, con su propio contexto (SessionGuard ya lo fijó): sin ella, 403. */
  async #patientOrganization(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const security = request.securityContext;
    const status =
      security?.organizationId && security.patientId && security.userId && this.directory
        ? await this.directory.patientOrganizationStatus(security.organizationId, {
            userId: security.userId,
            patientId: security.patientId,
          })
        : null;
    if (!status) throw new ProblemException(403, UNAVAILABLE);
    this.#ensureStatus(context, request, status);
    return true;
  }

  /** SUSPENDED y CLOSED: 403. READ_ONLY (RN-A02): 422 en toda escritura salvo las permitidas. */
  #ensureStatus(
    context: ExecutionContext,
    request: ContextualRequest,
    status: OrganizationStatus,
  ): void {
    if (status === 'SUSPENDED' || status === 'CLOSED') {
      throw new ProblemException(403, UNAVAILABLE);
    }
    const allowedWhenReadOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOWED_WHEN_READ_ONLY,
      [context.getHandler(), context.getClass()],
    );
    if (status === 'READ_ONLY' && !SAFE_METHODS.has(request.method) && !allowedWhenReadOnly) {
      throw new ProblemException(422, READ_ONLY);
    }
  }
}
