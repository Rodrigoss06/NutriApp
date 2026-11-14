import { describe, expect, it } from 'vitest';
import { migratedConsentOf, noonUtcOf } from './patient-import.js';

describe('RN-B01 · RF-40 · el consentimiento de datos de salud de un paciente importado', () => {
  it('con fecha, se migra; sin fecha, entra sin él', () => {
    expect(migratedConsentOf('1990-05-12', '2024-03-01')).toBe('MIGRATED');
    expect(migratedConsentOf('1990-05-12', null)).toBe('NOT_GIVEN');
  });

  it('con menos de 14 años en la fecha del consentimiento, no se migra: solo vale el papel del tutor', () => {
    expect(migratedConsentOf('2012-06-01', '2026-05-31')).toBe('MINOR');
    expect(migratedConsentOf('2012-06-01', '2026-06-01')).toBe('MIGRATED');
  });

  it('la fecha sin hora se guarda al mediodía UTC: el mismo día en cualquier zona de América', () => {
    expect(noonUtcOf('2024-03-01').toISOString()).toBe('2024-03-01T12:00:00.000Z');
  });
});
