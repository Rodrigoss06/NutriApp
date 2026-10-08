import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash, verify } from '@node-rs/argon2';
import type {
  CommonPasswords,
  PasswordHasher,
  SecretTokens,
} from '../../../application/ports/iam.ports.js';

/** Algorithm.Argon2id de @node-rs/argon2: un const enum, que verbatimModuleSyntax no deja importar. */
const ARGON2ID = 2;

/** OWASP para argon2id: 19 MiB, 2 pasadas, 1 hilo (RNF-13). */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * argon2id con un hash señuelo calculado al arrancar: verificarlo cuesta lo mismo que una cuenta real, así el
 * tiempo de respuesta no delata qué correos existen.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  #decoy: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyDecoy(password: string): Promise<void> {
    this.#decoy ??= hash(randomBytes(32).toString('base64'), ARGON2_OPTIONS);
    await this.verify(await this.#decoy, password);
  }

  /** Se llama al iniciar el módulo: el primer intento ya no paga el cálculo del señuelo. */
  warmUp(): Promise<string> {
    this.#decoy ??= hash(randomBytes(32).toString('base64'), ARGON2_OPTIONS);
    return this.#decoy;
  }
}

/** Lista de contraseñas comunes (assets/common-passwords, decisión 1 de P5), en un Set al arrancar. */
export class CommonPasswordList implements CommonPasswords {
  readonly #words: ReadonlySet<string>;

  constructor(
    file: URL = new URL(
      '../../../../../../assets/common-passwords/common-passwords.txt.gz',
      import.meta.url,
    ),
  ) {
    const text = gunzipSync(readFileSync(file)).toString('utf8');
    this.#words = new Set(text.split('\n').filter(Boolean));
  }

  get size(): number {
    return this.#words.size;
  }

  has(lowercased: string): boolean {
    return this.#words.has(lowercased);
  }
}

/** Tokens de 256 bits en base64url; en la base solo su SHA-256. */
export class RandomSecretTokens implements SecretTokens {
  generate(): { token: string; hash: Uint8Array } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): Uint8Array {
    return createHash('sha256').update(token, 'utf8').digest();
  }
}
