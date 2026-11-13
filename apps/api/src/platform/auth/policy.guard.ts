import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../http/problem.js';
import type { ContextualRequest } from '../http/request-context.js';
import { ACCESS_RULE, PERMISSIONS, SUPPORT_PERMISSIONS, type AccessRule } from './access.js';
import type { MemberRole } from './tenant-directory.port.js';

/**
 * Tercera guardia (02 §10): el rol de la organización activa tiene el permiso del caso de uso (RN-A04). En modo soporte, el alcance
 * del permiso del dueño decide qué se lee (RN-A09, ADR-129).
 */
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
    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const role = request.securityContext?.role;
    if (role === 'PLATFORM_ADMIN') {
      const scope = request.support?.scope;
      const readable: readonly string[] = scope ? SUPPORT_PERMISSIONS[scope] : [];
      if (readable.includes(rule.permission)) return true;
      throw new ProblemException(403, {
        title: 'Tu permiso de soporte no incluye esto.',
        code: 'NC-TEN-015',
        rule: 'RN-A09',
      });
    }
    const allowed: readonly MemberRole[] = PERMISSIONS[rule.permission];
    if (role && (allowed as readonly string[]).includes(role)) return true;
    throw new ProblemException(403, {
      title: 'Tu rol no permite hacer esto.',
      code: 'NC-TEN-015',
      rule: 'RN-A04',
    });
  }
}
