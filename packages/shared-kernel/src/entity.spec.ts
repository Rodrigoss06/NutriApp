import { describe, expect, it } from 'vitest';
import { Entity } from './entity.js';
import { asId, type Id } from './id.js';

type MeasurementId = Id<'MeasurementId'>;

class Measurement extends Entity<MeasurementId> {
  constructor(
    id: MeasurementId,
    readonly valueMm: number,
  ) {
    super(id);
  }
}

class Note extends Entity<MeasurementId> {
  static create(id: MeasurementId): Note {
    return new Note(id);
  }
}

const ID_A = asId<'MeasurementId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e');
const ID_B = asId<'MeasurementId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6f');

describe('02 §5 · Entity: igualdad por identidad', () => {
  it('expone su identificador', () => {
    expect(new Measurement(ID_A, 12).id).toBe(ID_A);
  });

  it('con el mismo id es la misma entidad aunque cambien sus datos', () => {
    const measurement = new Measurement(ID_A, 12);

    expect(measurement.equals(measurement)).toBe(true);
    expect(measurement.equals(new Measurement(ID_A, 13))).toBe(true);
  });

  it('con ids distintos son entidades distintas', () => {
    expect(new Measurement(ID_A, 12).equals(new Measurement(ID_B, 12))).toBe(false);
  });

  it('entidades de tipos distintos no son iguales aunque compartan id', () => {
    expect(new Measurement(ID_A, 12).equals(Note.create(ID_A))).toBe(false);
  });

  it('no se iguala con null ni con undefined', () => {
    expect(new Measurement(ID_A, 12).equals(null)).toBe(false);
    expect(new Measurement(ID_A, 12).equals(undefined)).toBe(false);
  });
});
