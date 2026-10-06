import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { EncryptionPort, OrganizationId } from '@nutricoach/shared-kernel';
import { loadEnv } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION_BYTES = 2;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = VERSION_BYTES + NONCE_BYTES + TAG_BYTES;

/** `v1:BASE64,v2:BASE64` → llaves por versión. env.ts ya validó el formato y el tamaño. */
export function parseKeys(value: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const entry of value.split(',')) {
    const [version = '', key = ''] = entry.split(':');
    keys.set(Number(version.slice(1)), Buffer.from(key, 'base64'));
  }
  return keys;
}

/**
 * AES-256-GCM con versión de llave (RN-B06). Formato: versión (2 bytes) | nonce (12) | tag (16) | cifrado.
 * Cifra con la versión más alta y descifra con la que indica el valor: rotar es agregar una llave nueva y
 * volver a cifrar con calma. Los errores nunca incluyen el texto plano.
 */
export class AesGcmEncryption implements EncryptionPort {
  readonly #keys: ReadonlyMap<number, Buffer>;
  readonly #current: number;
  readonly #blindIndexKey: Buffer;

  constructor(
    keys: string = loadEnv().ENCRYPTION_KEYS,
    blindIndexKey: string = loadEnv().BLIND_INDEX_KEY,
  ) {
    this.#keys = parseKeys(keys);
    this.#current = Math.max(...this.#keys.keys());
    this.#blindIndexKey = Buffer.from(blindIndexKey, 'base64');
  }

  encrypt(plaintext: string, associatedData: string): Uint8Array {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key(this.#current), nonce);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const version = Buffer.alloc(VERSION_BYTES);
    version.writeUInt16BE(this.#current);
    return Buffer.concat([version, nonce, cipher.getAuthTag(), encrypted]);
  }

  decrypt(ciphertext: Uint8Array, associatedData: string): string {
    const value = Buffer.from(ciphertext);
    if (value.length < HEADER_BYTES) throw new Error('Valor cifrado incompleto.');
    const decipher = createDecipheriv(
      ALGORITHM,
      this.#key(value.readUInt16BE(0)),
      value.subarray(VERSION_BYTES, VERSION_BYTES + NONCE_BYTES),
    );
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(value.subarray(VERSION_BYTES + NONCE_BYTES, HEADER_BYTES));
    try {
      return Buffer.concat([
        decipher.update(value.subarray(HEADER_BYTES)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('No se pudo descifrar: el valor fue alterado o no corresponde a este lugar.');
    }
  }

  blindIndex(organizationId: OrganizationId, kind: string, value: string): Uint8Array {
    return createHmac('sha256', this.#blindIndexKey)
      .update(`${organizationId}:${kind}:${value}`)
      .digest();
  }

  /** Versión de llave con que se cifró un valor: la usa la rotación para saber qué volver a cifrar. */
  keyVersionOf(ciphertext: Uint8Array): number {
    return Buffer.from(ciphertext).readUInt16BE(0);
  }

  #key(version: number): Buffer {
    const key = this.#keys.get(version);
    if (!key) throw new Error(`No hay llave de cifrado v${String(version)} en ENCRYPTION_KEYS.`);
    return key;
  }
}
