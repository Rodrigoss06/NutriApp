import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('01 §8 · contrato de las verificaciones de salud', () => {
  it('acepta el estado del proceso, con o sin el detalle de cada dependencia', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(healthResponseSchema.parse({ status: 'error', checks: { database: 'error' } })).toEqual({
      status: 'error',
      checks: { database: 'error' },
    });
  });

  it('rechaza un estado desconocido', () => {
    expect(healthResponseSchema.safeParse({ status: 'degraded' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'ok', checks: { db: 'maybe' } }).success).toBe(
      false,
    );
  });
});
