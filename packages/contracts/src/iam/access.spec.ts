import { describe, expect, it } from 'vitest';
import { loginRequestSchema, passwordResetConfirmSchema, updateAccountSchema } from './access.js';

describe('P5 · contratos de acceso', () => {
  it('entrar: recorta el correo y no limita la contraseña más allá de lo absurdo', () => {
    expect(loginRequestSchema.parse({ email: '  ana@demo.test ', password: 'x' })).toEqual({
      email: 'ana@demo.test',
      password: 'x',
    });
    expect(loginRequestSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(
      false,
    );
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.pe', password: 'x'.repeat(1025) }).success,
    ).toBe(false);
  });

  it('el token del enlace son 32 bytes en base64url', () => {
    const token = 'A'.repeat(43);
    expect(passwordResetConfirmSchema.safeParse({ token, newPassword: 'x' }).success).toBe(true);
    expect(passwordResetConfirmSchema.safeParse({ token: 'corto', newPassword: 'x' }).success).toBe(
      false,
    );
  });

  it('el nombre visible no puede quedar vacío', () => {
    expect(updateAccountSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });
});
