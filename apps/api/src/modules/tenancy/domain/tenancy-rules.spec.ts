import { describe, expect, it } from 'vitest';
import { checkSetting, settingValue } from './settings.js';
import {
  addDays,
  checkCapacity,
  checkInvitationRole,
  checkMemberManagement,
  checkRoleChange,
  isPastGrace,
  localDate,
} from './tenancy-rules.js';

describe('RN-A04 · roles', () => {
  it('solo un OWNER da o quita el rol OWNER', () => {
    expect(
      checkRoleChange({
        actorRole: 'ADMIN',
        isSelf: false,
        currentRole: 'PROFESSIONAL',
        newRole: 'OWNER',
      })?.code,
    ).toBe('NC-TEN-003');
    expect(
      checkRoleChange({ actorRole: 'ADMIN', isSelf: false, currentRole: 'OWNER', newRole: 'ADMIN' })
        ?.code,
    ).toBe('NC-TEN-003');
    expect(
      checkRoleChange({
        actorRole: 'OWNER',
        isSelf: false,
        currentRole: 'ADMIN',
        newRole: 'OWNER',
      }),
    ).toBeNull();
  });

  it('nadie sube su propio rol; bajarlo sí', () => {
    expect(
      checkRoleChange({ actorRole: 'ADMIN', isSelf: true, currentRole: 'ADMIN', newRole: 'OWNER' })
        ?.code,
    ).toBe('NC-TEN-004');
    expect(
      checkRoleChange({ actorRole: 'OWNER', isSelf: true, currentRole: 'OWNER', newRole: 'ADMIN' }),
    ).toBeNull();
  });

  it('un ADMIN invita administradores y profesionales, no dueños; no gestiona dueños', () => {
    expect(checkInvitationRole('ADMIN', 'ADMIN')).toBeNull();
    expect(checkInvitationRole('ADMIN', 'OWNER')?.rule).toBe('RN-A04');
    expect(checkMemberManagement('ADMIN', 'OWNER')?.code).toBe('NC-TEN-006');
    expect(checkMemberManagement('OWNER', 'OWNER')).toBeNull();
  });
});

describe('RN-A03 · cupos congelados en la suscripción', () => {
  it('cabe uno más mientras lo ocupado más uno no pase del límite', () => {
    expect(checkCapacity('STAFF', 4, 5)).toBeNull();
    expect(checkCapacity('STAFF', 5, 5)).toMatchObject({ code: 'NC-TEN-001', rule: 'RN-A03' });
    expect(checkCapacity('PATIENTS', 50, 50)).toMatchObject({ code: 'NC-TEN-007', rule: 'RN-A03' });
  });
});

describe('RN-A02 · vencimiento con gracia, en la fecha local de la organización', () => {
  it('la fecha local sale de la zona horaria: medianoche UTC aún es el día anterior en Lima', () => {
    expect(localDate(new Date('2026-10-08T03:00:00Z'), 'America/Lima')).toBe('2026-10-07');
    expect(localDate(new Date('2026-10-08T06:00:00Z'), 'America/Lima')).toBe('2026-10-08');
  });

  it('vale hasta ends_on inclusive; la gracia hasta ends_on + días; solo lectura al día siguiente', () => {
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
    expect(isPastGrace('2026-12-30', 7, '2027-01-06')).toBe(false);
    expect(isPastGrace('2026-12-30', 7, '2027-01-07')).toBe(true);
    expect(isPastGrace('2026-12-30', 0, '2026-12-30')).toBe(false);
    expect(isPastGrace('2026-12-30', 0, '2026-12-31')).toBe(true);
  });
});

describe('ajustes de la organización', () => {
  it('invitation.ttl_days de 1 a 30 lo edita la organización; la gracia solo la plataforma', () => {
    expect(checkSetting('invitation.ttl_days', 14, 'ORGANIZATION')).toBeNull();
    expect(checkSetting('invitation.ttl_days', 31, 'ORGANIZATION')?.code).toBe('NC-TEN-030');
    expect(checkSetting('invitation.ttl_days', 1.5, 'ORGANIZATION')?.code).toBe('NC-TEN-030');
    expect(checkSetting('subscription.grace_days', 10, 'ORGANIZATION')?.code).toBe('NC-TEN-031');
    expect(checkSetting('subscription.grace_days', 0, 'PLATFORM')).toBeNull();
  });

  it('un valor guardado inválido vuelve al valor por defecto', () => {
    expect(settingValue('invitation.ttl_days', 14)).toBe(14);
    expect(settingValue('invitation.ttl_days', 'catorce')).toBe(7);
    expect(settingValue('subscription.grace_days', undefined)).toBe(7);
  });
});
