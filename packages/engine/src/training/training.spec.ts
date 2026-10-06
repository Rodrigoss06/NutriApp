import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { kg } from '../units.js';
import {
  COMPLIANCE,
  FRACTIONAL_SETS,
  ONERM_BRZYCKI1993,
  ONERM_EPLEY1985,
  RPE_FROM_RIR,
  SFR,
  TONNAGE,
} from './index.js';

describe('RN-F03 y RN-F06 · las series de calentamiento no cuentan', () => {
  const sets = [
    { exercise: 'Sentadilla', loadKg: kg(60), reps: 10, warmup: true },
    { exercise: 'Sentadilla', loadKg: kg(100), reps: 8 },
  ];

  it('ni en el tonelaje ni en las series por grupo muscular', () => {
    expect(expectOk(runMethod(TONNAGE, { sets })).outputs.tonnageKg).toBe(800);
    expect(
      expectOk(
        runMethod(FRACTIONAL_SETS, {
          sets,
          muscleMap: { Sentadilla: [{ muscle: 'Cuádriceps', role: 'PRIMARY' }] },
        }),
      ).outputs.setsByMuscle,
    ).toEqual({ Cuádriceps: 1 });
  });

  it('un ejercicio sin grupos musculares no suma series', () => {
    expect(
      expectOk(runMethod(FRACTIONAL_SETS, { sets, muscleMap: {} })).outputs.setsByMuscle,
    ).toEqual({});
  });
});

describe('RN-F04 · 1RM estimado', () => {
  it.each([ONERM_EPLEY1985, ONERM_BRZYCKI1993])(
    '%s: ERROR con más de 12 repeticiones',
    (method) => {
      expect(expectOk(runMethod(method, { loadKg: kg(100), reps: 12 })).outputs.estimated).toBe(
        true,
      );
      expect(expectErrors(runMethod(method, { loadKg: kg(100), reps: 13 }))).toEqual([
        { rule: 'RN-D06', code: 'NC-ENG-401', severity: 'ERROR' },
      ]);
    },
  );

  it.each([ONERM_EPLEY1985, ONERM_BRZYCKI1993])(
    '%s: con 1 repetición el 1RM es la carga',
    (method) => {
      expect(expectOk(runMethod(method, { loadKg: kg(100), reps: 1 })).outputs.oneRmKg).toBe(100);
    },
  );

  it('rechaza repeticiones que no son un entero positivo', () => {
    expect(expectErrors(runMethod(ONERM_EPLEY1985, { loadKg: kg(100), reps: 0 }))).toEqual([
      { rule: 'RN-F04', code: 'NC-ENG-402', severity: 'ERROR' },
    ]);
  });
});

describe('RN-F05 · RPE desde RIR', () => {
  it.each([-1, 11])('rechaza un RIR de %s', (rir) => {
    expect(expectErrors(runMethod(RPE_FROM_RIR, { rir }))).toEqual([
      { rule: 'RN-F05', code: 'NC-ENG-403', severity: 'ERROR' },
    ]);
  });
});

describe('RN-F07 · estímulo y fatiga', () => {
  it('SFR = promedio de estímulo ÷ promedio de fatiga, rotulado como heurística', () => {
    const { outputs } = expectOk(
      runMethod(SFR, {
        ratings: [
          { stimulus: 4, fatigue: 2 },
          { stimulus: 5, fatigue: 3 },
        ],
      }),
    );
    expect(outputs.sfr).toBeCloseTo(4.5 / 2.5, 12);
    expect(outputs.label).toBe('HEURISTIC');
  });

  it.each([[[]], [[{ stimulus: 0, fatigue: 3 }]], [[{ stimulus: 3, fatigue: 6 }]]])(
    'rechaza %j: valoraciones enteras de 1 a 5 y al menos una',
    (ratings) => {
      expect(expectErrors(runMethod(SFR, { ratings }))).toEqual([
        { rule: 'RN-F07', code: 'NC-ENG-404', severity: 'ERROR' },
      ]);
    },
  );
});

describe('RN-F09 · cumplimiento', () => {
  it('0 si no hubo prescripción', () => {
    expect(expectOk(runMethod(COMPLIANCE, { done: 3, planned: 0 })).outputs.compliancePct).toBe(0);
  });
});
