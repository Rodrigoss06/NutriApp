import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runMethod } from '../../src/registry/run-method.js';
import { READINESS_JV, type ReadinessInput } from '../../src/training/index.js';
import { expectOk } from '../support.js';

/** Un dato opcional del registro diario: a veces falta (07 §9, RN-G11). */
const optional = <T>(value: fc.Arbitrary<T>) => fc.option(value, { nil: null });
const score = fc.integer({ min: 1, max: 5 });
const halfHours = fc.integer({ min: 0, max: 48 }).map((halves) => halves / 2);

const readinessInput: fc.Arbitrary<ReadinessInput> = fc.record({
  day: fc.record({
    sessionMinutes: optional(fc.integer({ min: 0, max: 600 })),
    sessionRpe: optional(fc.integer({ min: 0, max: 20 }).map((halves) => halves / 2)),
    sleepHours: optional(halfHours),
    fatigue: optional(score),
    soreness: optional(score),
    stress: optional(score),
    motivation: optional(score),
    menstrualSymptoms: optional(fc.integer({ min: 0, max: 3 })),
    performancePlanned: optional(fc.integer({ min: 0, max: 20_000 })),
    performanceActual: optional(fc.integer({ min: 0, max: 20_000 })),
    restingHrBpm: optional(fc.integer({ min: 25, max: 220 })),
    hrvMs: optional(fc.integer({ min: 1, max: 300 })),
  }),
  baseline: fc.record({
    sleepTargetHours: optional(fc.integer({ min: 8, max: 24 }).map((halves) => halves / 2)),
    restingHrBpm: optional(fc.integer({ min: 25, max: 220 })),
    hrvMs: optional(fc.integer({ min: 1, max: 300 })),
  }),
  thresholds: fc.constant({
    neutralScore: 75,
    readinessGreenMin: 75,
    readinessRedBelow: 60,
    performanceMinPct: 90,
  }),
});

const readinessOf = (value: ReadinessInput) =>
  expectOk(runMethod(READINESS_JV, value)).outputs.readinessScore;

describe('RN-G14 · propiedades de la recuperación', () => {
  it('queda entre 0 y 100, o sin dato si el día no tiene ninguno', () => {
    fc.assert(
      fc.property(readinessInput, (value) => {
        const readiness = readinessOf(value);
        if (readiness !== null) {
          expect(readiness).toBeGreaterThanOrEqual(0);
          expect(readiness).toBeLessThanOrEqual(100);
        }
      }),
    );
  });

  it('dormir más nunca baja la recuperación', () => {
    fc.assert(
      fc.property(readinessInput, halfHours, (value, extra) => {
        const sleepHours = value.day.sleepHours ?? 0;
        const more = Math.min(24, sleepHours + extra);
        const before = readinessOf({ ...value, day: { ...value.day, sleepHours } });
        const after = readinessOf({ ...value, day: { ...value.day, sleepHours: more } });
        expect(after ?? 0).toBeGreaterThanOrEqual(before ?? 0);
      }),
    );
  });

  it('más fatiga nunca sube la recuperación', () => {
    fc.assert(
      fc.property(readinessInput, score, score, (value, a, b) => {
        const [less, more] = a <= b ? [a, b] : [b, a];
        const withLess = readinessOf({ ...value, day: { ...value.day, fatigue: less } });
        const withMore = readinessOf({ ...value, day: { ...value.day, fatigue: more } });
        expect(withMore ?? 0).toBeLessThanOrEqual(withLess ?? 0);
      }),
    );
  });
});
