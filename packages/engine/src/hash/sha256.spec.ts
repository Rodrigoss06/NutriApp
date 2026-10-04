import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256.js';

const webCryptoSha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('RN-D01 · SHA-256 puro para el hash de los insumos', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('vector FIPS 180-4 %j', (message, digest) => {
    expect(sha256Hex(message)).toBe(digest);
  });

  it('vector FIPS 180-4 de un millón de «a»', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('codifica en UTF-8 los textos con tildes, eñes y emojis', async () => {
    for (const text of ['Plátano', 'año', 'Würch', '💪 ×2']) {
      expect(sha256Hex(text)).toBe(await webCryptoSha256(text));
    }
  });

  it('coincide con WebCrypto para cualquier texto', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 300 }), async (text) => {
        expect(sha256Hex(text)).toBe(await webCryptoSha256(text));
      }),
      { numRuns: 200 },
    );
  });
});
