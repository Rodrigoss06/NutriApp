import { describe, expect, it } from 'vitest';
import {
  ageYears,
  canManagePatient,
  canWriteClinical,
  checkGrant,
  checkPopulation,
  isMinor,
  normalizeDocument,
  patientCode,
} from './clinical-rules.js';

describe('RN-B06 · documento normalizado antes del índice ciego', () => {
  it.each([
    ['DNI', '4567 8912', '45678912'],
    ['DNI', '4567891', null],
    ['DNI', '4567891A', null],
    ['CE', 'ab-12345', 'AB12345'],
    ['PASAPORTE', 'x1', null],
    ['OTRO', 'A'.repeat(21), null],
  ] as const)('%s %s → %s', (type, number, expected) => {
    expect(normalizeDocument(type, number)).toBe(expected);
  });
});

describe('Edad y menores', () => {
  it('cuenta los años cumplidos a la fecha local', () => {
    expect(ageYears('2008-10-09', '2026-10-09')).toBe(18);
    expect(ageYears('2008-10-10', '2026-10-09')).toBe(17);
    expect(isMinor('2008-10-10', '2026-10-09')).toBe(true);
    expect(isMinor('2008-10-09', '2026-10-09')).toBe(false);
  });
});

describe('RN-B01 · consentimiento', () => {
  it('OBESITY es dato de salud: solo con HEALTH_DATA', () => {
    expect(checkPopulation('OBESITY', false)?.rule).toBe('RN-B01');
    expect(checkPopulation('OBESITY', true)).toBeNull();
    expect(checkPopulation('ATHLETE', false)).toBeNull();
  });

  it('en papel exige escaneo; un menor no consiente desde la app; uno vigente no se repite', () => {
    const base = {
      channel: 'IN_PERSON_DIGITAL' as const,
      hasEvidence: false,
      minor: false,
      alreadyActive: false,
    };
    expect(checkGrant(base)).toBeNull();
    expect(checkGrant({ ...base, channel: 'PAPER_SCANNED' })?.code).toBe('NC-CLI-009');
    expect(checkGrant({ ...base, channel: 'PAPER_SCANNED', hasEvidence: true })).toBeNull();
    expect(checkGrant({ ...base, channel: 'APP', minor: true })?.code).toBe('NC-CLI-010');
    expect(checkGrant({ ...base, channel: 'IN_PERSON_DIGITAL', minor: true })).toBeNull();
    expect(checkGrant({ ...base, alreadyActive: true })?.code).toBe('NC-CLI-008');
  });
});

describe('RN-A05 · quién gestiona y quién escribe', () => {
  const team = [
    { memberId: 'r', access: 'WRITE' as const },
    { memberId: 'w', access: 'WRITE' as const },
    { memberId: 'v', access: 'READ' as const },
  ];
  it('gestionan el responsable, OWNER y ADMIN', () => {
    expect(canManagePatient({ role: 'PROFESSIONAL', memberId: 'r' }, 'r')).toBe(true);
    expect(canManagePatient({ role: 'PROFESSIONAL', memberId: 'w' }, 'r')).toBe(false);
    expect(canManagePatient({ role: 'OWNER', memberId: 'x' }, 'r')).toBe(true);
    expect(canManagePatient({ role: 'ADMIN', memberId: 'x' }, 'r')).toBe(true);
  });
  it('escriben OWNER y el equipo con WRITE', () => {
    expect(canWriteClinical({ role: 'PROFESSIONAL', memberId: 'w' }, team)).toBe(true);
    expect(canWriteClinical({ role: 'PROFESSIONAL', memberId: 'v' }, team)).toBe(false);
    expect(canWriteClinical({ role: 'ADMIN', memberId: 'x' }, team)).toBe(false);
    expect(canWriteClinical({ role: 'OWNER', memberId: 'x' }, team)).toBe(true);
  });
  it('código correlativo', () => {
    expect(patientCode(123)).toBe('P-000123');
  });
});
