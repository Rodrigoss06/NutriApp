import { describe, expect, it } from 'vitest';
import {
  Argon2PasswordHasher,
  CommonPasswordList,
  RandomSecretTokens,
} from './security-adapters.js';

describe('RNF-13 · argon2id, contraseñas comunes y tokens opacos', () => {
  it('argon2id con los parámetros de OWASP; verificar falla con otra contraseña o un hash roto', async () => {
    const hasher = new Argon2PasswordHasher();
    const hashed = await hasher.hash('un-cielo-gris-sobre-lima');

    expect(hashed.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await hasher.verify(hashed, 'un-cielo-gris-sobre-lima')).toBe(true);
    expect(await hasher.verify(hashed, 'otra-contraseña-larga')).toBe(false);
    expect(await hasher.verify('no-es-un-hash', 'x')).toBe(false);
    await expect(hasher.verifyDecoy('lo-que-sea')).resolves.toBeUndefined();
  });

  it('RN-A07 · la lista tiene unas 122 000 contraseñas, con las agregadas en español', () => {
    const list = new CommonPasswordList();

    expect(list.size).toBeGreaterThan(120_000);
    expect(list.has('contraseña123')).toBe(true);
    expect(list.has('nutricionista')).toBe(true);
    expect(list.has('1234567890')).toBe(true);
    expect(list.has('un-cielo-gris-sobre-lima')).toBe(false);
  });

  it('los tokens son 32 bytes en base64url y se guarda solo su SHA-256', () => {
    const tokens = new RandomSecretTokens();
    const { token, hash } = tokens.generate();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toHaveLength(32);
    expect(Buffer.from(tokens.hash(token)).equals(Buffer.from(hash))).toBe(true);
    expect(tokens.generate().token).not.toBe(token);
  });
});
