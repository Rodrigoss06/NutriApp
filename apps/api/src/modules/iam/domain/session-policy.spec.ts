import { describe, expect, it } from 'vitest';
import {
  newSessionExpiry,
  SESSION_POLICY,
  slideSession,
  isSessionAlive,
} from './session-policy.js';

const HOUR = 60 * 60 * 1000;
const t0 = new Date('2026-10-07T12:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('RN-A08 · sesiones de profesional: 12 h de inactividad y 7 días como máximo', () => {
  it('nace con las dos expiraciones', () => {
    expect(newSessionExpiry('STAFF', t0)).toEqual({
      idleExpiresAt: at(12 * HOUR),
      absoluteExpiresAt: at(7 * 24 * HOUR),
    });
    expect(SESSION_POLICY.PLATFORM).toEqual(SESSION_POLICY.STAFF);
  });

  it('vence por inactividad aunque falte para el máximo', () => {
    const session = { ...newSessionExpiry('STAFF', t0), lastSeenAt: t0, revokedAt: null };
    expect(isSessionAlive(session, at(12 * HOUR - 1))).toBe(true);
    expect(isSessionAlive(session, at(12 * HOUR))).toBe(false);
    expect(isSessionAlive({ ...session, revokedAt: t0 }, at(1))).toBe(false);
  });

  it('desliza la inactividad como mucho una vez por minuto y nunca pasa del máximo', () => {
    const session = { ...newSessionExpiry('STAFF', t0), lastSeenAt: t0, revokedAt: null };
    expect(slideSession('STAFF', session, at(30_000))).toBeNull();
    expect(slideSession('STAFF', session, at(60_000))).toEqual({
      lastSeenAt: at(60_000),
      idleExpiresAt: at(60_000 + 12 * HOUR),
    });
    const nearEnd = at(7 * 24 * HOUR - HOUR);
    expect(
      slideSession('STAFF', { ...session, lastSeenAt: at(7 * 24 * HOUR - 2 * HOUR) }, nearEnd)
        ?.idleExpiresAt,
    ).toEqual(at(7 * 24 * HOUR));
  });

  it('el paciente tiene 30 días deslizantes', () => {
    expect(SESSION_POLICY.PATIENT.idleMs).toBe(30 * 24 * HOUR);
  });
});
