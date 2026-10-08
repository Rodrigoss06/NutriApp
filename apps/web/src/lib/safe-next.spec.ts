import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('?next= solo con rutas internas', () => {
  it.each([
    ['/panel/cuenta', '/panel/cuenta'],
    ['/panel?x=1', '/panel?x=1'],
    ['//evil.example', '/panel'],
    ['/\\evil.example', '/panel'],
    ['https://evil.example', '/panel'],
    ['panel', '/panel'],
    [null, '/panel'],
  ] as const)('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
