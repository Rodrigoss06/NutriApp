import { describe, expect, it } from 'vitest';
import { asId, isUuidV7, type Id } from './id.js';

const UUID_V7 = '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e';

describe('ADR-003 · identificadores UUIDv7 con marca de tipo', () => {
  it('reconoce un UUIDv7 en su forma canónica', () => {
    expect(isUuidV7(UUID_V7)).toBe(true);
  });

  it.each([
    ['un UUIDv4', '3b241101-e2bb-4255-8caf-4136c566a962'],
    ['un UUID sin guiones', '01928c4e3f5a7b2c9d1e0f2a3b4c5d6e'],
    ['una variante inválida', '01928c4e-3f5a-7b2c-1d1e-0f2a3b4c5d6e'],
    ['mayúsculas', '01928C4E-3F5A-7B2C-9D1E-0F2A3B4C5D6E'],
    ['un texto vacío', ''],
  ])('no acepta %s', (_case, value) => {
    expect(isUuidV7(value)).toBe(false);
  });

  it('asId conserva el texto y le pone la marca del tipo', () => {
    const patientId: Id<'PatientId'> = asId<'PatientId'>(UUID_V7);

    expect(patientId).toBe(UUID_V7);
  });

  it('asId falla con algo que no es UUIDv7: los bordes validan antes de llegar al dominio', () => {
    expect(() => asId('no-es-un-uuid')).toThrow(TypeError);
  });

  it('la marca impide mezclar identificadores de agregados distintos', () => {
    const patientId = asId<'PatientId'>(UUID_V7);
    // @ts-expect-error un PatientId no es un EvaluationId
    const evaluationId: Id<'EvaluationId'> = patientId;

    expect(evaluationId).toBe(patientId);
  });
});
