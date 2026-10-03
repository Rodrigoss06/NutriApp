import { describe, expect, it } from 'vitest';
import { CLOCK } from './clock.port.js';
import { ID_GENERATOR } from './id-generator.port.js';

describe('02 §5 · puertos Clock e IdGenerator', () => {
  it('sus tokens son símbolos globales: dos copias del kernel inyectan el mismo puerto', () => {
    expect(CLOCK).toBe(Symbol.for('nutricoach.Clock'));
    expect(ID_GENERATOR).toBe(Symbol.for('nutricoach.IdGenerator'));
    expect(CLOCK).not.toBe(ID_GENERATOR);
  });
});
