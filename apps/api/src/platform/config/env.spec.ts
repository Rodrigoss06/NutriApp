import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

/** Valores sintéticos: no son llaves reales de ningún entorno. */
const KEY = Buffer.alloc(32, 7).toString('base64');
const VALID = {
  DATABASE_URL: 'postgresql://app_user:clave@127.0.0.1:5432/nutricoach',
  ENCRYPTION_KEYS: `v1:${KEY}`,
  BLIND_INDEX_KEY: KEY,
};

describe('06 §4 · las variables de entorno se validan con Zod al arrancar', () => {
  it('NODE_ENV es development si no viene', () => {
    expect(loadEnv(VALID).NODE_ENV).toBe('development');
  });

  it.each(['development', 'test', 'production'] as const)('acepta NODE_ENV=%s', (nodeEnv) => {
    expect(loadEnv({ ...VALID, NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
  });

  it('falla al arrancar con un valor desconocido', () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: 'produccion' })).toThrow();
  });

  it('01 §12 · exige la base de datos de app_user', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://x@y/z' })).toThrow();
  });

  it('RN-B06 · acepta varias versiones de llave para rotar y rechaza llaves de otro tamaño', () => {
    expect(loadEnv({ ...VALID, ENCRYPTION_KEYS: `v1:${KEY},v2:${KEY}` }).ENCRYPTION_KEYS).toContain(
      'v2:',
    );
    expect(() => loadEnv({ ...VALID, ENCRYPTION_KEYS: KEY })).toThrow();
    expect(() => loadEnv({ ...VALID, ENCRYPTION_KEYS: 'v1:corta' })).toThrow();
    expect(() =>
      loadEnv({ ...VALID, BLIND_INDEX_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow();
  });

  it('el error no repite el valor recibido: puede ser un secreto', () => {
    const secret = 'v1:no-es-base64-pero-es-secreto';
    try {
      loadEnv({ ...VALID, ENCRYPTION_KEYS: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secreto');
    }
  });
});
