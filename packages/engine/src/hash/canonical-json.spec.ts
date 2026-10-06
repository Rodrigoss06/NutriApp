import { describe, expect, it } from 'vitest';
import { canonicalJson, inputsHash } from './index.js';

describe('RN-D01 · JSON canónico de los insumos', () => {
  it('ordena las claves en todos los niveles y conserva el orden de los arreglos', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,1]},"b":1}',
    );
  });

  it('el mismo insumo con las claves en otro orden da el mismo hash', () => {
    expect(inputsHash({ weightKg: 80, heightCm: 175 })).toBe(
      inputsHash({ heightCm: 175, weightKg: 80 }),
    );
    expect(inputsHash({ weightKg: 80 })).not.toBe(inputsHash({ weightKg: 80.1 }));
  });

  it('escribe los números como JSON, sin redondear', () => {
    expect(canonicalJson({ fatPct: 20.261538461538464, n: -0, ok: true, none: null })).toBe(
      '{"fatPct":20.261538461538464,"n":0,"none":null,"ok":true}',
    );
  });

  it.each([
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Number.POSITIVE_INFINITY }],
    ['undefined', { value: undefined }],
    ['una fecha', { value: new Date(0) }],
    ['una función', { value: () => 1 }],
  ])('rechaza %s: un insumo tiene que poder guardarse y volver a calcularse', (_case, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('el hash es SHA-256 en hexadecimal', () => {
    expect(inputsHash({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  });
});
