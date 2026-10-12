import { describe, expect, it } from 'vitest';
import {
  ageYears,
  canManagePatient,
  canWriteClinical,
  canWriteRecord,
  checkGrant,
  checkPopulation,
  needsGuardian,
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
  });

  it('⚠️ RN-B01 · desde los 14 años consiente como un adulto; antes, su padre, madre o tutor', () => {
    expect(needsGuardian('2012-10-10', '2026-10-09')).toBe(true);
    expect(needsGuardian('2012-10-09', '2026-10-09')).toBe(false);
    expect(needsGuardian('2009-01-01', '2026-10-09')).toBe(false);
  });
});

describe('RN-B01 · consentimiento', () => {
  it('OBESITY es dato de salud: solo con HEALTH_DATA', () => {
    expect(checkPopulation('OBESITY', false)?.rule).toBe('RN-B01');
    expect(checkPopulation('OBESITY', true)).toBeNull();
    expect(checkPopulation('ATHLETE', false)).toBeNull();
  });

  it('en papel exige escaneo; para un menor de 14 solo vale el papel del tutor; uno vigente no se repite', () => {
    const base = {
      channel: 'IN_PERSON_DIGITAL' as const,
      hasEvidence: false,
      needsGuardian: false,
      alreadyActive: false,
    };
    expect(checkGrant(base)).toBeNull();
    expect(checkGrant({ ...base, channel: 'PAPER_SCANNED' })?.code).toBe('NC-CLI-009');
    expect(checkGrant({ ...base, channel: 'PAPER_SCANNED', hasEvidence: true })).toBeNull();
    const guardian = { ...base, needsGuardian: true };
    expect(checkGrant(guardian)).toMatchObject({ code: 'NC-CLI-026', rule: 'RN-B01' });
    expect(checkGrant({ ...guardian, channel: 'APP' })?.code).toBe('NC-CLI-026');
    expect(checkGrant({ ...guardian, channel: 'PAPER_SCANNED' })?.code).toBe('NC-CLI-009');
    expect(checkGrant({ ...guardian, channel: 'PAPER_SCANNED', hasEvidence: true })).toBeNull();
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
  it('el expediente lo escribe solo el equipo con WRITE, también frente a OWNER', () => {
    expect(canWriteRecord({ memberId: 'w' }, team)).toBe(true);
    expect(canWriteRecord({ memberId: 'v' }, team)).toBe(false);
    expect(canWriteRecord({ memberId: 'x' }, team)).toBe(false);
    expect(canWriteRecord({ memberId: null }, team)).toBe(false);
  });
  it('código correlativo', () => {
    expect(patientCode(123)).toBe('P-000123');
  });
});

describe('RN-A06 · aceptar la invitación del paciente', () => {
  it('solo pide lo que falta; exige APP_ACCESS y HEALTH_DATA; un menor de 14 no consiente desde la app', async () => {
    const { checkAppEnrollment, pendingAppPurposes } = await import('./clinical-rules.js');
    expect(pendingAppPurposes(['HEALTH_DATA'])).toEqual(['APP_ACCESS']);
    expect(pendingAppPurposes(['HEALTH_DATA', 'APP_ACCESS'])).toEqual([]);
    const pending = pendingAppPurposes([]);
    expect(
      checkAppEnrollment({ pending, accepted: ['APP_ACCESS'], needsGuardian: false })?.code,
    ).toBe('NC-CLI-025');
    expect(
      checkAppEnrollment({
        pending,
        accepted: ['APP_ACCESS', 'HEALTH_DATA'],
        needsGuardian: false,
      }),
    ).toBeNull();
    expect(
      checkAppEnrollment({ pending, accepted: ['APP_ACCESS', 'HEALTH_DATA'], needsGuardian: true })
        ?.code,
    ).toBe('NC-CLI-010');
    expect(checkAppEnrollment({ pending: [], accepted: [], needsGuardian: true })).toBeNull();
  });
});
