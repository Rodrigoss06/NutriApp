import { describe, expect, it } from 'vitest';
import { domainError, type ErrorCode, type RuleCode } from './domain-error.js';

describe('06 §5 · DomainError: code NC-… y rule RN-… para responder 422', () => {
  it('conserva código, regla, mensaje y detalle', () => {
    const error = domainError({
      code: 'NC-ASM-004',
      rule: 'RN-C02',
      message: 'Se necesita una tercera toma',
      details: { maxDiffPct: 5 },
    });

    expect(error).toEqual({
      code: 'NC-ASM-004',
      rule: 'RN-C02',
      message: 'Se necesita una tercera toma',
      details: { maxDiffPct: 5 },
    });
  });

  it('la regla es opcional', () => {
    expect(domainError({ code: 'NC-IAM-001', message: 'Credenciales inválidas' })).toEqual({
      code: 'NC-IAM-001',
      message: 'Credenciales inválidas',
    });
  });

  it('no se puede modificar', () => {
    const error = domainError({ code: 'NC-ASM-004', message: 'x', details: { sites: ['A'] } });

    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it.each(['ASM-004', 'NC-ASM-4', 'nc-asm-004', 'NC-ASM-0004'])(
    'rechaza el código %s porque no sigue NC-CONTEXTO-NNN (06 §3)',
    (code) => {
      expect(() => domainError({ code: code as ErrorCode, message: 'x' })).toThrow(TypeError);
    },
  );

  it.each(['C02', 'RN-c02', 'RN-C2'])('rechaza la regla %s porque no sigue RN-X00', (rule) => {
    expect(() => domainError({ code: 'NC-ASM-004', rule: rule as RuleCode, message: 'x' })).toThrow(
      TypeError,
    );
  });
});
