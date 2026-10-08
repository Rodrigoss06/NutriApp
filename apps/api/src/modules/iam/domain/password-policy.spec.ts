import { describe, expect, it } from 'vitest';
import {
  checkNewPassword,
  normalizePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password-policy.js';

const notCommon = (candidate: string): boolean => candidate.length < 0;
const check = (
  password: string,
  email = 'ana.perez@demo.test',
  isCommon: (candidate: string) => boolean = notCommon,
) => checkNewPassword(password, { email, isCommon });

describe('RN-A07 · contraseñas de 10 a 128 caracteres, sin las comunes', () => {
  it('normaliza a NFKC antes de validar y de hashear', () => {
    expect(normalizePassword('ｐａｓｓｗｏｒｄ１２３')).toBe('password123');
    expect(normalizePassword('café')).toBe('café');
  });

  it('cuenta code points, no unidades UTF-16: 10 emojis bastan', () => {
    expect(check('🙂'.repeat(10))).toBeNull();
    expect(check('🙂'.repeat(9))?.code).toBe('NC-IAM-001');
  });

  it(`rechaza menos de ${String(PASSWORD_MIN_LENGTH)} y más de ${String(PASSWORD_MAX_LENGTH)}`, () => {
    expect(check('corta-123')).toMatchObject({ code: 'NC-IAM-001', rule: 'RN-A07' });
    expect(check('x'.repeat(129))).toMatchObject({ code: 'NC-IAM-001', rule: 'RN-A07' });
    expect(check('un-cielo-gris-sobre-lima')).toBeNull();
    expect(check('x'.repeat(128))).toBeNull();
  });

  it('rechaza las comunes, comparando en minúsculas', () => {
    const list = new Set(['contraseña123']);
    const isCommon = (candidate: string) => list.has(candidate);
    expect(check('Contraseña123', 'a@b.pe', isCommon)).toMatchObject({
      code: 'NC-IAM-002',
      rule: 'RN-A07',
    });
  });

  it('rechaza la que contiene «nutricoach» o la parte local del correo si tiene 4 letras o más', () => {
    expect(check('MiNutriCoach2026!')).toMatchObject({ code: 'NC-IAM-003' });
    expect(check('soy-ana.perez-2026')).toMatchObject({ code: 'NC-IAM-003' });
    expect(check('soy-ana-1234567', 'ana@demo.test')).toBeNull();
  });
});
