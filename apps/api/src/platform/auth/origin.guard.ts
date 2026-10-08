import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '../config/env.js';
import { ProblemException } from '../http/problem.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF (P5): además de SameSite=Lax, toda escritura trae Origin igual a APP_URL, también entrar (login CSRF).
 * Sin Origin, 403: los navegadores lo envían siempre en POST, PUT, PATCH y DELETE.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  readonly #appOrigin = loadEnv().APP_URL;

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers.origin === this.#appOrigin) return true;
    throw new ProblemException(403, {
      title: 'La petición no viene de la aplicación.',
      code: 'NC-PLT-010',
    });
  }
}
