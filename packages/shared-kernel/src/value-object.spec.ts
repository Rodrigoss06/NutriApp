import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object.js';

interface SiteReadingProps {
  siteCode: string;
  attemptsMm: number[];
  takenAt?: Date;
}

class SiteReading extends ValueObject<SiteReadingProps> {
  static of(props: SiteReadingProps): SiteReading {
    return new SiteReading(props);
  }

  get siteCode(): string {
    return this.props.siteCode;
  }

  get attemptsMm(): readonly number[] {
    return this.props.attemptsMm;
  }
}

class OtherReading extends ValueObject<SiteReadingProps> {
  static of(props: SiteReadingProps): OtherReading {
    return new OtherReading(props);
  }
}

class Pair extends ValueObject<{ left: SiteReading; right: SiteReading }> {
  static of(left: SiteReading, right: SiteReading): Pair {
    return new Pair({ left, right });
  }
}

const triceps = (attemptsMm: number[]): SiteReading =>
  SiteReading.of({ siteCode: 'SKF_TRICEPS', attemptsMm });

describe('02 §5 · ValueObject: igualdad por valor e inmutabilidad', () => {
  it('dos objetos con los mismos valores son iguales', () => {
    const reading = triceps([12, 12.5]);

    expect(reading.equals(reading)).toBe(true);
    expect(reading.equals(triceps([12, 12.5]))).toBe(true);
  });

  it('un valor distinto los hace diferentes', () => {
    expect(triceps([12, 12.5]).equals(triceps([12, 13]))).toBe(false);
    expect(triceps([12, 12.5]).equals(triceps([12]))).toBe(false);
    expect(
      triceps([12]).equals(SiteReading.of({ siteCode: 'SKF_SUBSCAPULAR', attemptsMm: [12] })),
    ).toBe(false);
  });

  it('compara fechas por su instante y value objects anidados por valor', () => {
    const at = (iso: string) =>
      SiteReading.of({ siteCode: 'SKF_TRICEPS', attemptsMm: [12], takenAt: new Date(iso) });

    expect(at('2026-10-01T10:00:00Z').equals(at('2026-10-01T10:00:00Z'))).toBe(true);
    expect(at('2026-10-01T10:00:00Z').equals(at('2026-10-01T11:00:00Z'))).toBe(false);
    expect(
      Pair.of(triceps([12]), triceps([13])).equals(Pair.of(triceps([12]), triceps([13]))),
    ).toBe(true);
    expect(
      Pair.of(triceps([12]), triceps([13])).equals(Pair.of(triceps([12]), triceps([14]))),
    ).toBe(false);
  });

  it('clases distintas con los mismos valores no son iguales', () => {
    const props = { siteCode: 'SKF_TRICEPS', attemptsMm: [12] };

    expect(SiteReading.of(props).equals(OtherReading.of(props))).toBe(false);
  });

  it('no se iguala con null ni con undefined', () => {
    expect(triceps([12]).equals(null)).toBe(false);
    expect(triceps([12]).equals(undefined)).toBe(false);
  });

  it('no se puede modificar después de crearlo', () => {
    const reading = triceps([12, 12.5]);

    expect(Object.isFrozen(reading.attemptsMm)).toBe(true);
    expect(() => (reading.attemptsMm as number[]).push(13)).toThrow(TypeError);
  });

  it('copia los datos de entrada: cambiarlos después no lo altera', () => {
    const attemptsMm = [12, 12.5];
    const reading = triceps(attemptsMm);
    attemptsMm.push(13);

    expect(reading.attemptsMm).toEqual([12, 12.5]);
  });
});
