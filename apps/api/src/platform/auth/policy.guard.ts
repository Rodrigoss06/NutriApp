import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../http/problem.js';
import type { ContextualRequest } from '../http/request-context.js';
import { ACCESS_RULE, PERMISSIONS, type AccessRule } from './access.js';
import type { MemberRole } from './tenant-directory.port.js';

/** Tercera guardia (02 §10): el rol de la organización activa tiene el permiso del caso de uso (RN-A04). */
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind !== 'tenant') return true;
    const role = context.switchToHttp().getRequest<ContextualRequest>().securityContext?.role;
    const allowed: readonly MemberRole[] = PERMISSIONS[rule.permission];
    if (role && (allowed as readonly string[]).includes(role)) return true;
    throw new ProblemException(403, {
      title: 'Tu rol no permite hacer esto.',
      code: 'NC-TEN-015',
      rule: 'RN-A04',
    });
  }
}
