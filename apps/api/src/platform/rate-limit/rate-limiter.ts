import { createHash } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import type { PrismaClient } from '../database/generated/client.js';
import { PRISMA } from '../database/prisma.provider.js';
import { ProblemException } from '../http/problem.js';

/** Un límite: cuántos intentos caben en una ventana fija por clave. */
export interface RateLimitRule {
  readonly scope: string;
  readonly windowSeconds: number;
  readonly max: number;
}

/** Valores iniciales de P5 (decisión 2). RATE_LIMIT_FACTOR los multiplica en E2E y k6. */
export const RATE_LIMITS = {
  loginByIp: { scope: 'login:ip', windowSeconds: 15 * 60, max: 30 },
  resetByIp: { scope: 'reset:ip', windowSeconds: 15 * 60, max: 5 },
  resetByEmail: { scope: 'reset:email', windowSeconds: 60 * 60, max: 3 },
  tokenLinkByIp: { scope: 'token-link:ip', windowSeconds: 15 * 60, max: 30 },
} as const satisfies Record<string, RateLimitRule>;

/** La IPv6 se agrupa por /64: un atacante tiene millones de direcciones en su prefijo. */
export function rateLimitIp(ip: string | undefined): string {
  if (!ip) return 'desconocida';
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!isIPv6(address)) return address;
  const [head = '', tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [
    ...left,
    ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ];
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group || '0', 16).toString(16))
    .join(':')}::/64`;
}

/** El correo se normaliza antes del hash: «Ana@Demo.test » y «ana@demo.test» son la misma clave. */
export function rateLimitEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Límite de intentos en la base (ADR-030): la aplicación no guarda estado en memoria. La clave es el SHA-256 de
 * «alcance:valor»: ni el correo ni la IP llegan en claro a la tabla. Pasado el máximo, 429 con Retry-After.
 */
@Injectable()
export class RateLimiter {
  readonly #factor = loadEnv().RATE_LIMIT_FACTOR;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async consume(rule: RateLimitRule, value: string): Promise<void> {
    const key = createHash('sha256').update(`${rule.scope}:${value}`, 'utf8').digest();
    const max = Math.max(1, Math.floor(rule.max * this.#factor));
    const [result] = await this.prisma.$queryRaw<
      { allowed: boolean; retry_after_seconds: number }[]
    >`
      SELECT allowed, retry_after_seconds FROM app.hit_rate_limit(${key}, ${rule.windowSeconds}::int, ${max}::int)`;
    if (result?.allowed !== false) return;
    throw new ProblemException(
      429,
      { title: 'Demasiados intentos. Espera unos minutos y vuelve a probar.', code: 'NC-PLT-429' },
      { 'Retry-After': String(result.retry_after_seconds) },
    );
  }
}
