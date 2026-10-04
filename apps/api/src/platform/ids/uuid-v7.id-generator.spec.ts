import { describe, expect, it } from 'vitest';
import { isUuidV7 } from '@nutricoach/shared-kernel';
import { UuidV7IdGenerator } from './uuid-v7.id-generator.js';

describe('ADR-003 · el IdGenerator de la aplicación entrega UUIDv7', () => {
  const ids = new UuidV7IdGenerator();

  it('genera UUIDv7 válidos', () => {
    expect(isUuidV7(ids.newId())).toBe(true);
  });

  it('son únicos y crecen en el tiempo, aun dentro del mismo milisegundo', () => {
    const generated = Array.from({ length: 1000 }, () => ids.newId());

    expect(new Set(generated).size).toBe(generated.length);
    expect([...generated].sort()).toEqual(generated);
  });
});
