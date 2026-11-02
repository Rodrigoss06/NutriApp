import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { ENGINE_VERSION } from '../version.js';
import {
  dailyIndication,
  performancePct,
  READINESS_JV,
  srpeLoad,
  type ReadinessBaseline,
  type ReadinessDay,
  type ReadinessInput,
  type ReadinessThresholds,
} from './readiness.js';

/** Los umbrales base de la V3 (07 §11). */
const V3: ReadinessThresholds = {
  neutralScore: 75,
  readinessGreenMin: 75,
  readinessRedBelow: 60,
  performanceMinPct: 90,
};

const EMPTY: ReadinessDay = {
  sessionMinutes: null,
  sessionRpe: null,
  sleepHours: null,
  fatigue: null,
  soreness: null,
  stress: null,
  motivation: null,
  menstrualSymptoms: null,
  performancePlanned: null,
  performanceActual: null,
  restingHrBpm: null,
  hrvMs: null,
};

const BASELINE: ReadinessBaseline = { sleepTargetHours: 8, restingHrBpm: 58, hrvMs: 50 };

const input = (
  day: Partial<ReadinessDay>,
  baseline: Partial<ReadinessBaseline> = {},
  thresholds: Partial<ReadinessThresholds> = {},
): ReadinessInput => ({
  day: { ...EMPTY, ...day },
  baseline: { ...BASELINE, ...baseline },
  thresholds: { ...V3, ...thresholds },
});

const outputsOf = (value: ReadinessInput) => expectOk(runMethod(READINESS_JV, value)).outputs;

describe('RN-G14 · las cuatro partes de la recuperación (07 §9)', () => {
  it('sueño frente al objetivo, con tope de 100', () => {
    expect(outputsOf(input({ sleepHours: 6 })).components.sleep).toBe(75);
    expect(outputsOf(input({ sleepHours: 10 })).components.sleep).toBe(100);
  });

  it('FC en reposo frente a la basal: 6 puntos por latido, con piso de 20', () => {
    expect(outputsOf(input({ restingHrBpm: 60 })).components.heartRate).toBe(88);
    expect(outputsOf(input({ restingHrBpm: 80 })).components.heartRate).toBe(20);
  });

  it('P-19: con la FC bajo la basal la parte no pasa de 100, como el rango de 0 a 100 de la recuperación', () => {
    expect(outputsOf(input({ restingHrBpm: 50 })).components.heartRate).toBe(100);
  });

  it('HRV frente a la basal, con tope de 100', () => {
    expect(outputsOf(input({ hrvMs: 40 })).components.hrv).toBe(80);
    expect(outputsOf(input({ hrvMs: 80 })).components.hrv).toBe(100);
  });

  it('subjetiva: (6 − fatiga) + (6 − dolor) + (6 − estrés) + motivación sobre 20', () => {
    const { components } = outputsOf(input({ fatigue: 1, soreness: 1, stress: 1, motivation: 5 }));
    expect(components.subjective).toBe(100);
  });

  it('P-02: la parte subjetiva promedia solo lo respondido', () => {
    expect(outputsOf(input({ fatigue: 1 })).components.subjective).toBe(100);
    expect(outputsOf(input({ fatigue: 5, motivation: 5 })).components.subjective).toBe(60);
  });
});

describe('RN-G14 · un dato que falta no es cero: vale el neutral de la organización', () => {
  it('sin el dato del día o sin su línea base, la parte vale el neutral y queda marcada', () => {
    const outputs = outputsOf(
      input({ sleepHours: 7, restingHrBpm: 62 }, { sleepTargetHours: null }, { neutralScore: 70 }),
    );

    expect(outputs.components).toEqual({ sleep: 70, heartRate: 76, hrv: 70, subjective: 70 });
    expect(outputs.neutralComponents).toEqual(['sleep', 'hrv', 'subjective']);
    expect(outputs.readinessScore).toBe(71.5);
  });

  it('sin ningún dato de recuperación no hay recuperación: SIN DATOS, aunque haya sesión o síntomas', () => {
    const outputs = outputsOf(input({ sessionMinutes: 45, sessionRpe: 6, menstrualSymptoms: 3 }));

    expect(outputs.readinessScore).toBeNull();
    expect(outputs.indication).toBe('NO_DATA');
    expect(outputs.neutralComponents).toEqual(['sleep', 'heartRate', 'hrv', 'subjective']);
    expect(outputs.srpeLoad).toBe(270);
  });

  it('un dato del día sin su línea base cuenta como dato: la recuperación se calcula con los neutrales', () => {
    const outputs = outputsOf(input({ restingHrBpm: 62 }, { restingHrBpm: null }));

    expect(outputs.readinessScore).toBe(75);
    expect(outputs.indication).toBe('GREEN');
  });
});

describe('RN-G14 · carga sRPE y rendimiento', () => {
  it('la carga es minutos × RPE; sin uno de los dos, sin dato', () => {
    expect(srpeLoad(0, 7)).toBe(0);
    expect(srpeLoad(60, null)).toBeNull();
    expect(srpeLoad(null, 7)).toBeNull();
  });

  it('el rendimiento pide planificado mayor que 0 y real', () => {
    expect(performancePct(0, 95)).toBeNull();
    expect(performancePct(null, 95)).toBeNull();
    expect(performancePct(100, null)).toBeNull();
    expect(performancePct(80, 100)).toBe(120);
    expect(performancePct(200, 150)).toBe(75);
  });
});

describe('RN-G15 · indicación del día con los umbrales de la organización', () => {
  it('el orden de la V3: sin recuperación, síntomas 3 o roja, amarilla o rendimiento bajo, y verde', () => {
    const day = { menstrualSymptoms: null, performancePct: null };
    expect(dailyIndication({ ...day, readinessScore: null }, V3)).toBe('NO_DATA');
    expect(dailyIndication({ ...day, readinessScore: 60 }, V3)).toBe('YELLOW');
    expect(dailyIndication({ ...day, readinessScore: 59.99 }, V3)).toBe('RED');
    expect(dailyIndication({ ...day, readinessScore: 75 }, V3)).toBe('GREEN');
    expect(dailyIndication({ ...day, readinessScore: 90, menstrualSymptoms: 2 }, V3)).toBe('GREEN');
    expect(dailyIndication({ ...day, readinessScore: 90, performancePct: 90 }, V3)).toBe('GREEN');
  });

  it('otra organización con otros umbrales recibe otra indicación para el mismo día', () => {
    const day = {
      sleepHours: 7,
      restingHrBpm: 62,
      fatigue: 2,
      soreness: 3,
      stress: 2,
      motivation: 4,
    };
    expect(outputsOf(input(day)).indication).toBe('GREEN');
    expect(outputsOf(input(day, {}, { readinessGreenMin: 80 })).indication).toBe('YELLOW');
  });

  it('de punta a punta: una recuperación de 70 da AMARILLO', () => {
    const outputs = outputsOf(
      input({
        sleepHours: 5.6,
        restingHrBpm: 63,
        hrvMs: 35,
        fatigue: 3,
        soreness: 3,
        stress: 3,
        motivation: 5,
      }),
    );

    expect(outputs.components).toEqual({ sleep: 70, heartRate: 70, hrv: 70, subjective: 70 });
    expect(outputs.indication).toBe('YELLOW');
  });
});

describe('RN-G11 · RN-D01 · insumos válidos y sobre del resultado', () => {
  it.each([
    ['la fatiga fuera de 1 a 5', { fatigue: 6 }],
    ['la motivación con decimales', { motivation: 2.5 }],
    ['el sueño sobre 24 h', { sleepHours: 25 }],
    ['el RPE sobre 10', { sessionRpe: 11 }],
    ['los minutos sobre 600', { sessionMinutes: 601 }],
    ['los síntomas sobre 3', { menstrualSymptoms: 4 }],
    ['la FC bajo 25 lpm', { restingHrBpm: 20 }],
    ['la HRV en 0', { hrvMs: 0 }],
    ['un rendimiento negativo', { performanceActual: -1 }],
  ] as const)('no calcula con %s: NC-ENG-406', (_, day) => {
    expect(expectErrors(runMethod(READINESS_JV, input(day)))).toEqual([
      { rule: 'RN-G11', code: 'NC-ENG-406', severity: 'ERROR' },
    ]);
  });

  it('no calcula con una línea base fuera de rango: NC-ENG-407', () => {
    expect(
      expectErrors(runMethod(READINESS_JV, input({ sleepHours: 7 }, { sleepTargetHours: 3 }))),
    ).toEqual([{ rule: 'RN-G14', code: 'NC-ENG-407', severity: 'ERROR' }]);
  });

  it('no calcula con la roja sobre la verde: NC-ENG-408', () => {
    expect(
      expectErrors(
        runMethod(READINESS_JV, input({ sleepHours: 7 }, {}, { readinessRedBelow: 80 })),
      ),
    ).toEqual([{ rule: 'RN-G15', code: 'NC-ENG-408', severity: 'ERROR' }]);
  });

  it('el sobre lleva método, versión, versión del motor e insumos con su hash, igual cada vez', () => {
    const value = input({ sleepHours: 7, fatigue: 2 });
    const first = expectOk(runMethod(READINESS_JV, value));
    const second = expectOk(runMethod(READINESS_JV, value));

    expect(first).toMatchObject({
      methodCode: 'READINESS_JV',
      methodVersion: '3.0.0',
      engineVersion: ENGINE_VERSION,
      inputs: value,
    });
    expect(first.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.inputsHash).toBe(first.inputsHash);
    expect(expectOk(runMethod(READINESS_JV, input({ sleepHours: 7.5 }))).inputsHash).not.toBe(
      first.inputsHash,
    );
  });
});
