export type SessionKind = 'STAFF' | 'PATIENT' | 'PLATFORM';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * RN-A08: profesional, 12 h de inactividad y 7 días como máximo; plataforma, igual. Paciente, 30 días deslizantes:
 * su tope absoluto de un año es provisional hasta P13.
 */
export const SESSION_POLICY: Readonly<
  Record<SessionKind, { readonly idleMs: number; readonly absoluteMs: number }>
> = {
  STAFF: { idleMs: 12 * HOUR, absoluteMs: 7 * DAY },
  PLATFORM: { idleMs: 12 * HOUR, absoluteMs: 7 * DAY },
  PATIENT: { idleMs: 30 * DAY, absoluteMs: 365 * DAY },
};

/** La inactividad se desliza como mucho una vez por minuto: una escritura por minuto y sesión. */
export const SLIDE_INTERVAL_MS = MINUTE;

export interface SessionTimes {
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

export function newSessionExpiry(
  kind: SessionKind,
  now: Date,
): { idleExpiresAt: Date; absoluteExpiresAt: Date } {
  const policy = SESSION_POLICY[kind];
  return {
    idleExpiresAt: new Date(now.getTime() + policy.idleMs),
    absoluteExpiresAt: new Date(now.getTime() + policy.absoluteMs),
  };
}

export function isSessionAlive(session: SessionTimes, now: Date): boolean {
  return (
    session.revokedAt === null &&
    now.getTime() < session.idleExpiresAt.getTime() &&
    now.getTime() < session.absoluteExpiresAt.getTime()
  );
}

/** Nueva inactividad si ya pasó un minuto desde la última vez; null si no toca escribir. */
export function slideSession(
  kind: SessionKind,
  session: SessionTimes,
  now: Date,
): { lastSeenAt: Date; idleExpiresAt: Date } | null {
  if (now.getTime() - session.lastSeenAt.getTime() < SLIDE_INTERVAL_MS) return null;
  const idle = Math.min(
    now.getTime() + SESSION_POLICY[kind].idleMs,
    session.absoluteExpiresAt.getTime(),
  );
  return { lastSeenAt: now, idleExpiresAt: new Date(idle) };
}
