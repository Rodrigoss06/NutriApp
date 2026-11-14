import { describe, expect, it } from 'vitest';
import { createSupportGrantSchema, SUPPORT_SCOPES } from './support-access.js';

describe('RN-A09 · el permiso de soporte del dueño (ADR-124, ADR-129)', () => {
  const body = {
    supportUserId: '0192f0a0-0000-7000-8000-0000000000cc',
    scope: 'CLINICAL_READ',
    reason: '  Revisar el plan que no calcula  ',
  };

  it('dos alcances; de 1 a 7 días, 1 si no se dice; el motivo recortado, de 3 a 300 caracteres', () => {
    expect(SUPPORT_SCOPES).toEqual(['ACCOUNT', 'CLINICAL_READ']);
    expect(createSupportGrantSchema.parse(body)).toEqual({
      ...body,
      reason: 'Revisar el plan que no calcula',
      durationDays: 1,
    });
    expect(createSupportGrantSchema.parse({ ...body, durationDays: 7 }).durationDays).toBe(7);
    for (const wrong of [
      { ...body, durationDays: 8 },
      { ...body, durationDays: 0 },
      { ...body, durationDays: 1.5 },
      { ...body, reason: ' ab ' },
      { ...body, reason: 'x'.repeat(301) },
      { ...body, scope: 'WRITE' },
      { ...body, extra: true },
    ]) {
      expect(createSupportGrantSchema.safeParse(wrong).success, JSON.stringify(wrong)).toBe(false);
    }
  });
});
