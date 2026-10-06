import { normalizeDocumentNumber, type OrganizationId } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import { AesGcmEncryption, parseKeys } from './aes-gcm.encryption.js';

/** Llaves sintéticas de prueba. */
const K1 = Buffer.alloc(32, 11).toString('base64');
const K2 = Buffer.alloc(32, 22).toString('base64');
const BIDX = Buffer.alloc(32, 33).toString('base64');
const ORG_A = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const ORG_B = '0192f0a0-0000-7000-8000-00000000000b' as OrganizationId;
const AAD = `${ORG_A}:clinical.patient.document_number`;

describe('RN-B06 · AES-256-GCM con versión de llave', () => {
  it('cifra y descifra; dos cifrados del mismo valor son distintos (nonce al azar)', () => {
    const crypto = new AesGcmEncryption(`v1:${K1}`, BIDX);
    const first = crypto.encrypt('12345678', AAD);
    const second = crypto.encrypt('12345678', AAD);

    expect(crypto.decrypt(first, AAD)).toBe('12345678');
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
    expect(Buffer.from(first).includes(Buffer.from('12345678'))).toBe(false);
  });

  it('rota: cifra con la versión más alta y sigue descifrando lo cifrado con la anterior', () => {
    const old = new AesGcmEncryption(`v1:${K1}`, BIDX);
    const rotated = new AesGcmEncryption(`v1:${K1},v2:${K2}`, BIDX);
    const legacy = old.encrypt('999888777', AAD);
    const fresh = rotated.encrypt('999888777', AAD);

    expect(rotated.keyVersionOf(legacy)).toBe(1);
    expect(rotated.keyVersionOf(fresh)).toBe(2);
    expect(rotated.decrypt(legacy, AAD)).toBe('999888777');
    expect(() => old.decrypt(fresh, AAD)).toThrow('v2');
  });

  it('falla si el valor fue alterado o se copió a otro lugar, sin mostrar el texto plano', () => {
    const crypto = new AesGcmEncryption(`v1:${K1}`, BIDX);
    const value = Buffer.from(crypto.encrypt('12345678', AAD));
    const tampered = Buffer.from(value);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    expect(() => crypto.decrypt(tampered, AAD)).toThrow(/alterado/);
    expect(() => crypto.decrypt(value, `${ORG_B}:clinical.patient.document_number`)).toThrow(
      /alterado/,
    );
    expect(() => crypto.decrypt(value.subarray(0, 10), AAD)).toThrow('incompleto');
    try {
      crypto.decrypt(tampered, AAD);
    } catch (error) {
      expect(String(error)).not.toContain('12345678');
    }
  });

  it('índice ciego: igual para el mismo documento normalizado, distinto entre organizaciones y tipos', () => {
    const crypto = new AesGcmEncryption(`v1:${K1}`, BIDX);
    const index = (org: OrganizationId, kind: string, raw: string) =>
      Buffer.from(crypto.blindIndex(org, kind, normalizeDocumentNumber(raw))).toString('hex');

    expect(index(ORG_A, 'DNI', '12 345-678')).toBe(index(ORG_A, 'DNI', '12345678'));
    expect(index(ORG_A, 'DNI', '12345678')).not.toBe(index(ORG_B, 'DNI', '12345678'));
    expect(index(ORG_A, 'DNI', '12345678')).not.toBe(index(ORG_A, 'CE', '12345678'));
    expect(index(ORG_A, 'DNI', '01234567')).not.toBe(index(ORG_A, 'DNI', '1234567'));
    expect(crypto.blindIndex(ORG_A, 'DNI', '1')).toHaveLength(32);
  });

  it('lee las llaves por versión', () => {
    expect([...parseKeys(`v1:${K1},v7:${K2}`).keys()]).toEqual([1, 7]);
  });
});
