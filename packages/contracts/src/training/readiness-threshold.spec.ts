import { describe, expect, it } from 'vitest';
import { readinessThresholdValuesSchema } from './readiness-threshold.js';

const V3 = {
  neutralScore: 75,
  readinessGreenMin: 75,
  readinessRedBelow: 60,
  performanceMinPct: 90,
  weeklySleepMinHours: 6.5,
  fatigueSorenessAmberAbove: 4,
  nutritionMinPct: 80,
};

describe('07 §11 · RN-G15 · los umbrales de la organización', () => {
  it('acepta los valores base de la V3', () => {
    expect(readinessThresholdValuesSchema.parse(V3)).toEqual(V3);
  });

  it('la roja no pasa a la verde y cada valor queda en su rango', () => {
    expect(readinessThresholdValuesSchema.safeParse({ ...V3, readinessRedBelow: 80 }).success).toBe(
      false,
    );
    expect(
      readinessThresholdValuesSchema.safeParse({ ...V3, fatigueSorenessAmberAbove: 6 }).success,
    ).toBe(false);
    expect(
      readinessThresholdValuesSchema.safeParse({ ...V3, weeklySleepMinHours: 6.25 }).success,
    ).toBe(false);
    expect(readinessThresholdValuesSchema.safeParse({ ...V3, extra: 1 }).success).toBe(false);
  });
});
