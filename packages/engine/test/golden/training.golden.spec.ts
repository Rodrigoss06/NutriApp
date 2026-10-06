import { describe, expect, it } from 'vitest';
import { runMethod } from '../../src/registry/run-method.js';
import {
  COMPLIANCE,
  FRACTIONAL_SETS,
  ONERM_BRZYCKI1993,
  ONERM_EPLEY1985,
  RPE_FROM_RIR,
  TONNAGE,
} from '../../src/training/index.js';
import { kg } from '../../src/units.js';
import { expectOk } from '../support.js';

const SESSION = [
  { exercise: 'Sentadilla', loadKg: kg(100), reps: 8 },
  { exercise: 'Sentadilla', loadKg: kg(100), reps: 8 },
  { exercise: 'Sentadilla', loadKg: kg(100), reps: 7 },
  { exercise: 'Press banca', loadKg: kg(70), reps: 10 },
  { exercise: 'Press banca', loadKg: kg(70), reps: 9 },
];

const MUSCLES = {
  Sentadilla: [
    { muscle: 'Cuádriceps', role: 'PRIMARY' },
    { muscle: 'Glúteo', role: 'PRIMARY' },
    { muscle: 'Isquiosurales', role: 'SECONDARY' },
  ],
  'Press banca': [
    { muscle: 'Pectoral', role: 'PRIMARY' },
    { muscle: 'Tríceps', role: 'SECONDARY' },
    { muscle: 'Deltoides anterior', role: 'SECONDARY' },
  ],
} as const;

describe('G-21 · RN-F03 · tonelaje', () => {
  it('sentadilla 100×8, 100×8, 100×7 y press de banca 70×10, 70×9: 3630 kg', () => {
    expect(expectOk(runMethod(TONNAGE, { sets: SESSION })).outputs.tonnageKg).toBe(3630);
  });
});

describe('G-22 · RN-F04 · 1RM estimado', () => {
  it('100 kg × 8: Epley 126.7 kg; Brzycki 124.1 kg', () => {
    const set = { loadKg: kg(100), reps: 8 };
    expect(expectOk(runMethod(ONERM_EPLEY1985, set)).outputs.oneRmKg).toBeCloseTo(126.67, 2);
    expect(expectOk(runMethod(ONERM_BRZYCKI1993, set)).outputs.oneRmKg).toBeCloseTo(124.14, 2);
  });
});

describe('G-23 · RN-F05 · RPE desde RIR', () => {
  it('RIR 2: RPE 8', () => {
    expect(expectOk(runMethod(RPE_FROM_RIR, { rir: 2 })).outputs.rpe).toBe(8);
  });
});

describe('G-24 · RN-F06 · series fraccionadas', () => {
  it('cuádriceps 3; glúteo 3; isquiosurales 1.5; pectoral 2; tríceps 1; deltoides anterior 1', () => {
    expect(
      expectOk(runMethod(FRACTIONAL_SETS, { sets: SESSION, muscleMap: MUSCLES })).outputs
        .setsByMuscle,
    ).toEqual({
      Cuádriceps: 3,
      Glúteo: 3,
      Isquiosurales: 1.5,
      Pectoral: 2,
      Tríceps: 1,
      'Deltoides anterior': 1,
    });
  });
});

describe('G-25 · RN-F09 · cumplimiento', () => {
  it('12 de 16 series de pecho: 75 %', () => {
    expect(expectOk(runMethod(COMPLIANCE, { done: 12, planned: 16 })).outputs.compliancePct).toBe(
      75,
    );
  });
});
