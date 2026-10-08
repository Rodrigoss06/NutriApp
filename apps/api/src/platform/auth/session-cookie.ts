import { createHash } from 'node:crypto';
import { parseCookie } from 'cookie';
import type { Request, Response } from 'express';
import { loadEnv } from '../config/env.js';

/** Hash del token opaco: lo único que se guarda (ADR-009). */
export function hashToken(token: string): Uint8Array {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function sessionCookieName(): string {
  return loadEnv().SESSION_COOKIE_NAME;
}

/**
 * Secure según el esquema de APP_URL (ADR-035): con https, siempre; con http://localhost, no, porque WebKit no
 * guarda cookies Secure en http://localhost (bug 232088) y el E2E móvil corre en WebKit. env.ts exige https fuera
 * de local y con el prefijo __Host-.
 */
function secure(): boolean {
  return loadEnv().APP_URL.startsWith('https:');
}

/** Token de la cookie de sesión, si llegó. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  return parseCookie(header)[sessionCookieName()] ?? null;
}

/**
 * Cookie httpOnly, SameSite=Lax y Path=/ sin Domain, Secure con https: con el prefijo __Host- (staging y producción)
 * el navegador exige justo eso. Vence con la sesión: su expiración absoluta.
 */
export function setSessionCookie(response: Response, token: string, absoluteExpiresAt: Date): void {
  response.cookie(sessionCookieName(), token, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    expires: absoluteExpiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(sessionCookieName(), {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
  });
}
