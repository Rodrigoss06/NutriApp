import { describe, expect, it } from 'vitest';
import {
  canSuppress,
  PATIENT_ANONYMIZED,
  SUPPRESSION_CODE_MISMATCH,
  SUPPRESSION_NOT_ALLOWED,
  SUPPRESSION_NOT_ARCHIVED,
} from './patient-suppression.js';

const archived = { status: 'ARCHIVED' as const, anonymizedAt: null, code: 'P-0007' };

describe('RN-B05 · la supresión del paciente', () => {
  it('la confirma el dueño escribiendo el código, sin importar mayúsculas ni espacios', () => {
    expect(canSuppress({ role: 'OWNER' }, archived, 'P-0007')).toBeNull();
    expect(canSuppress({ role: 'OWNER' }, archived, '  p-0007 ')).toBeNull();
  });

  it('nadie más: tampoco el administrador ni el responsable', () => {
    expect(canSuppress({ role: 'ADMIN' }, archived, 'P-0007')).toBe(SUPPRESSION_NOT_ALLOWED);
    expect(canSuppress({ role: 'PROFESSIONAL' }, archived, 'P-0007')).toBe(SUPPRESSION_NOT_ALLOWED);
    expect(SUPPRESSION_NOT_ALLOWED.rule).toBe('RN-B05');
  });

  it('solo de un paciente archivado, una sola vez, y con su código', () => {
    expect(canSuppress({ role: 'OWNER' }, { ...archived, status: 'ACTIVE' }, 'P-0007')).toBe(
      SUPPRESSION_NOT_ARCHIVED,
    );
    expect(
      canSuppress({ role: 'OWNER' }, { ...archived, anonymizedAt: new Date() }, 'P-0007'),
    ).toBe(PATIENT_ANONYMIZED);
    expect(canSuppress({ role: 'OWNER' }, archived, 'P-0008')).toBe(SUPPRESSION_CODE_MISMATCH);
    expect(canSuppress({ role: 'OWNER' }, archived, '')).toBe(SUPPRESSION_CODE_MISMATCH);
  });
});
