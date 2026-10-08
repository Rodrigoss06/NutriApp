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

/** Token de la cookie de sesión, si llegó. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  return parseCookie(header)[sessionCookieName()] ?? null;
}

/**
 * Cookie httpOnly, Secure, SameSite=Lax y Path=/ sin Domain: con el prefijo __Host- (staging y producción) el
 * navegador exige justo eso. Vence con la sesión: su expiración absoluta.
 */
export function setSessionCookie(response: Response, token: string, absoluteExpiresAt: Date): void {
  response.cookie(sessionCookieName(), token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: absoluteExpiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(sessionCookieName(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}
