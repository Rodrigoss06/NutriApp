import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('06 §4 · las variables de entorno se validan con Zod al arrancar', () => {
  it('NODE_ENV es development si no viene', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development' });
  });

  it.each(['development', 'test', 'production'] as const)('acepta NODE_ENV=%s', (nodeEnv) => {
    expect(loadEnv({ NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
  });

  it('falla al arrancar con un valor desconocido', () => {
    expect(() => loadEnv({ NODE_ENV: 'produccion' })).toThrow();
  });
});
