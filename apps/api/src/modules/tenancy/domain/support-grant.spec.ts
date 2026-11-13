import { isErr, isOk } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  canRevoke,
  newSupportGrant,
  SUPPORT_GRANT_INVALID,
  SUPPORT_GRANT_NOT_ACTIVE,
  supportGrantStatus,
  type SupportGrantRecord,
} from './support-grant.js';

const NOW = new Date('2026-11-13T15:00:00Z');
const base = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  supportUserId: '00000000-0000-4000-8000-0000000000bb',
  grantedBy: '00000000-0000-4000-8000-0000000000cc',
  scope: 'CLINICAL_READ' as const,
  reason: '  Revisar el plan que no calcula  ',
};

const grant = (overrides: Partial<SupportGrantRecord> = {}): SupportGrantRecord => ({
  ...base,
  reason: 'Revisar el plan',
  createdAt: NOW,
  expiresAt: new Date('2026-11-14T15:00:00Z'),
  revokedAt: null,
  ...overrides,
});

describe('RN-A09 · el permiso de soporte del dueño', () => {
  it('dura los días que elige el dueño desde que lo da, con el motivo recortado', () => {
    const result = newSupportGrant({ ...base, durationDays: 3 }, NOW);
    expect(isOk(result) && result.value).toEqual({
      ...base,
      reason: 'Revisar el plan que no calcula',
      createdAt: NOW,
      expiresAt: new Date('2026-11-16T15:00:00Z'),
      revokedAt: null,
    });
  });

  it('de 1 a 7 días enteros (ADR-124), y con un motivo de 3 a 300 caracteres', () => {
    for (const durationDays of [0, 8, 1.5, -1]) {
      const result = newSupportGrant({ ...base, durationDays }, NOW);
      expect(isErr(result) && result.error).toBe(SUPPORT_GRANT_INVALID);
    }
    for (const reason of ['  a ', 'x'.repeat(301)]) {
      const result = newSupportGrant({ ...base, reason, durationDays: 1 }, NOW);
      expect(isErr(result) && result.error).toBe(SUPPORT_GRANT_INVALID);
    }
    expect(isOk(newSupportGrant({ ...base, durationDays: 7 }, NOW))).toBe(true);
    expect(SUPPORT_GRANT_INVALID.rule).toBe('RN-A09');
  });

  it('caduca sola: vigente hasta su hora de vencimiento, y revocado manda sobre vencido', () => {
    expect(supportGrantStatus(grant(), NOW)).toBe('ACTIVE');
    expect(supportGrantStatus(grant(), new Date('2026-11-14T15:00:00Z'))).toBe('EXPIRED');
    expect(supportGrantStatus(grant({ revokedAt: NOW }), NOW)).toBe('REVOKED');
    expect(supportGrantStatus(grant({ revokedAt: NOW }), new Date('2026-11-20T00:00:00Z'))).toBe(
      'REVOKED',
    );
  });

  it('solo se revoca uno vigente', () => {
    expect(canRevoke(grant(), NOW)).toBeNull();
    expect(canRevoke(grant({ revokedAt: NOW }), NOW)).toBe(SUPPORT_GRANT_NOT_ACTIVE);
    expect(canRevoke(grant(), new Date('2026-11-15T00:00:00Z'))).toBe(SUPPORT_GRANT_NOT_ACTIVE);
  });
});
