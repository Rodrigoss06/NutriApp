import { describe, expect, it } from 'vitest';
import { requestHash, stableStringify } from './request-hash.js';

describe('RN-G08 · huella de la petición para Idempotency-Key', () => {
  it('el mismo cuerpo con otro orden de claves es la misma petición', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}',
    );
    expect(requestHash('post', '/api/v1/me/food-logs', { ml: 250, item: 'agua' })).toEqual(
      requestHash('POST', '/api/v1/me/food-logs', { item: 'agua', ml: 250 }),
    );
  });

  it('cambia con el método, la ruta o el cuerpo', () => {
    const base = requestHash('POST', '/a', { x: 1 });

    expect(requestHash('PUT', '/a', { x: 1 })).not.toEqual(base);
    expect(requestHash('POST', '/b', { x: 1 })).not.toEqual(base);
    expect(requestHash('POST', '/a', { x: 2 })).not.toEqual(base);
  });

  it('sin cuerpo es null; las claves con undefined no cuentan', () => {
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(requestHash('DELETE', '/a', undefined)).toEqual(requestHash('DELETE', '/a', null));
    expect(requestHash('DELETE', '/a', undefined)).toHaveLength(32);
  });
});
