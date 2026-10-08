import { domainError } from '@nutricoach/shared-kernel';

/** RN-A07: cinco intentos fallidos bloquean la cuenta 15 minutos. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/**
 * Toda falla al entrar responde igual (401, mismo code y mensaje): cuenta inexistente, pendiente, deshabilitada,
 * bloqueada o contraseña errada. Así la respuesta no delata qué correos existen.
 */
export const INVALID_CREDENTIALS = domainError({
  code: 'NC-IAM-010',
  rule: 'RN-A07',
  message:
    'Correo o contraseña incorrectos. Tras 5 intentos fallidos, el acceso se pausa 15 minutos.',
});

export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
