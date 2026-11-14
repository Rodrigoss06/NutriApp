import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureFlag } from '@nutricoach/contracts';
import { UNIT_OF_WORK, type UnitOfWork } from '@nutricoach/shared-kernel';
import { ProblemException } from '../http/problem.js';
import type { ContextualRequest } from '../http/request-context.js';
import { FeatureFlags } from './feature-flags.js';

export const REQUIRED_FEATURE = 'nutricoach:required-feature';

/** La ruta existe solo si la organización tiene encendida la bandera (RF-39, ADR-127). */
export const RequireFeature = (key: FeatureFlag) => SetMetadata(REQUIRED_FEATURE, key);

/**
 * Quinta guardia (después de la de permisos): con la bandera apagada, la ruta responde 404 como si no existiera. Lee la bandera con
 * el contexto de la petición, del equipo o del paciente.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(FeatureFlags) private readonly flags: FeatureFlags,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const key = this.reflector.getAllAndOverride<FeatureFlag | undefined>(REQUIRED_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;
    const security = context.switchToHttp().getRequest<ContextualRequest>().securityContext;
    const organizationId = security?.organizationId;
    if (!security || !organizationId) return true;
    const enabled = await this.uow.query(security, () => this.flags.isEnabled(organizationId, key));
    if (enabled) return true;
    throw new ProblemException(404, {
      title: 'Esta función no está activa en tu organización.',
      code: 'NC-PLT-014',
    });
  }
}
