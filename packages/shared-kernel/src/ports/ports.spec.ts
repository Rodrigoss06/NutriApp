import { describe, expect, it } from 'vitest';
import { CLOCK } from './clock.port.js';
import { ID_GENERATOR } from './id-generator.port.js';
import { AUDIT_ACTIONS, AUDIT_PORT } from './audit.port.js';
import { ENCRYPTION_PORT, normalizeDocumentNumber } from './encryption.port.js';
import { OUTBOX } from './outbox.port.js';
import { ACTOR_ROLES, systemContext, UNIT_OF_WORK } from './unit-of-work.port.js';

describe('02 §5 · puertos Clock e IdGenerator', () => {
  it('sus tokens son símbolos globales: dos copias del kernel inyectan el mismo puerto', () => {
    expect(CLOCK).toBe(Symbol.for('nutricoach.Clock'));
    expect(ID_GENERATOR).toBe(Symbol.for('nutricoach.IdGenerator'));
    expect(CLOCK).not.toBe(ID_GENERATOR);
  });
});

describe('02 §6 · puertos UnitOfWork y Outbox', () => {
  it('sus tokens son símbolos globales distintos de los demás puertos', () => {
    expect(UNIT_OF_WORK).toBe(Symbol.for('nutricoach.UnitOfWork'));
    expect(OUTBOX).toBe(Symbol.for('nutricoach.Outbox'));
    expect(new Set([CLOCK, ID_GENERATOR, UNIT_OF_WORK, OUTBOX]).size).toBe(4);
  });

  it('RN-A04 · los roles del contexto son los de la RLS, más SYSTEM para el worker', () => {
    expect(ACTOR_ROLES).toEqual([
      'OWNER',
      'ADMIN',
      'PROFESSIONAL',
      'PATIENT',
      'PLATFORM_ADMIN',
      'SYSTEM',
    ]);
  });

  it('el contexto del worker no tiene usuario ni paciente y no se puede alterar', () => {
    const context = systemContext();

    expect(context).toEqual({
      organizationId: null,
      userId: null,
      role: 'SYSTEM',
      patientId: null,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(systemContext('org' as never).organizationId).toBe('org');
  });
});

describe('02 §10 · puertos de auditoría y cifrado', () => {
  it('sus tokens son símbolos globales únicos', () => {
    expect(
      new Set([CLOCK, ID_GENERATOR, UNIT_OF_WORK, OUTBOX, AUDIT_PORT, ENCRYPTION_PORT]).size,
    ).toBe(6);
  });

  it('RN-B03 · audita lecturas, exportaciones, cambios e ingresos', () => {
    expect(AUDIT_ACTIONS).toEqual(
      expect.arrayContaining(['READ', 'EXPORT', 'UPDATE', 'LOGIN', 'LOGIN_FAILED']),
    );
  });

  it.each([
    ['12 345 678', '12345678'],
    ['00123456', '00123456'],
    ['ab-12.34', 'AB1234'],
    ['０１２３４５６７', '01234567'],
  ])(
    'RN-B06 · normaliza el documento %s como %s, sin perder ceros a la izquierda',
    (raw, normalized) => {
      expect(normalizeDocumentNumber(raw)).toBe(normalized);
    },
  );
});
