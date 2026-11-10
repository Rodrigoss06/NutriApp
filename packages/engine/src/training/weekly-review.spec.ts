import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { ENGINE_VERSION } from '../version.js';
import {
  WEEKLY_REVIEW_JV,
  weeklyAggregates,
  weeklyDecision,
  type WeeklyAggregates,
  type WeeklyReviewDay,
  type WeeklyReviewInput,
  type WeeklyReviewThresholds,
} from './weekly-review.js';

/** Los umbrales base de la V3 (07 §11). */
const V3: WeeklyReviewThresholds = {
  performanceMinPct: 90,
  weeklySleepMinHours: 6.5,
  fatigueSorenessAmberAbove: 4,
  nutritionMinPct: 80,
};

const EMPTY: WeeklyReviewDay = {
  sessionMinutes: null,
  sessionRpe: null,
  sleepHours: null,
  restingHrBpm: null,
  hrvMs: null,
  fatigue: null,
  soreness: null,
  performancePct: null,
  nutritionCompliancePct: null,
  menstrualSymptoms: null,
};

/** Un día con sesión y todo en verde. */
const GOOD: WeeklyReviewDay = {
  ...EMPTY,
  sessionMinutes: 60,
  sessionRpe: 7,
  sleepHours: 7.5,
  fatigue: 2,
  soreness: 2,
  performancePct: 100,
  nutritionCompliancePct: 90,
};

const day = (values: Partial<WeeklyReviewDay>): WeeklyReviewDay => ({ ...EMPTY, ...values });

const input = (
  days: readonly WeeklyReviewDay[],
  plannedVolumeFactor = 1,
  thresholds: Partial<WeeklyReviewThresholds> = {},
): WeeklyReviewInput => ({ days, plannedVolumeFactor, thresholds: { ...V3, ...thresholds } });

const outputsOf = (value: WeeklyReviewInput) =>
  expectOk(runMethod(WEEKLY_REVIEW_JV, value)).outputs;

const NO_AVERAGES: Omit<WeeklyAggregates, 'sessions' | 'srpeLoad'> = {
  avgSleepHours: null,
  avgRestingHrBpm: null,
  avgHrvMs: null,
  avgFatigue: null,
  avgSoreness: null,
  avgPerformancePct: null,
  avgNutritionCompliancePct: null,
  avgMenstrualSymptoms: null,
};

describe('RN-G16 · agregados de la semana (07 §10)', () => {
  it('cuenta como sesión solo un día con duración mayor que 0 y suma la carga sRPE', () => {
    const aggregates = weeklyAggregates([
      day({ sessionMinutes: 60, sessionRpe: 7 }),
      day({ sessionMinutes: 45, sessionRpe: 8 }),
      day({ sessionMinutes: 0, sessionRpe: 0 }),
      day({ sessionMinutes: 30 }),
      day({}),
    ]);

    expect(aggregates.sessions).toBe(3);
    expect(aggregates.srpeLoad).toBe(780);
  });

  it('un dato que falta no es cero: los promedios usan solo los días con dato', () => {
    const aggregates = weeklyAggregates([
      day({ sleepHours: 7, fatigue: 2, restingHrBpm: 60 }),
      day({ sleepHours: 6, fatigue: null, hrvMs: 50 }),
      day({ performancePct: 95, nutritionCompliancePct: 70, menstrualSymptoms: 1 }),
    ]);

    expect(aggregates).toEqual({
      sessions: 0,
      srpeLoad: null,
      avgSleepHours: 6.5,
      avgRestingHrBpm: 60,
      avgHrvMs: 50,
      avgFatigue: 2,
      avgSoreness: null,
      avgPerformancePct: 95,
      avgNutritionCompliancePct: 70,
      avgMenstrualSymptoms: 1,
    });
  });

  it('una semana sin registros no tiene promedios ni carga', () => {
    expect(weeklyAggregates([])).toEqual({ sessions: 0, srpeLoad: null, ...NO_AVERAGES });
  });
});

describe('RN-G16 · semáforo, factor ajustado y decisión sugerida', () => {
  it('rojo por sueño bajo el mínimo, con la razón', () => {
    const review = outputsOf(input([{ ...GOOD, sleepHours: 6 }], 1));

    expect(review.light).toBe('RED');
    expect(review.reasons).toEqual(['SLEEP']);
    expect(review.suggestedVolumeFactor).toBe(0.75);
    expect(review.suggestedAction).toBe('DELOAD');
  });

  it('rojo por síntomas del ciclo con promedio de 2 o más', () => {
    const review = outputsOf(
      input([
        { ...GOOD, menstrualSymptoms: 2 },
        { ...GOOD, menstrualSymptoms: 2 },
      ]),
    );

    expect(review.light).toBe('RED');
    expect(review.reasons).toEqual(['MENSTRUAL_SYMPTOMS']);
  });

  it('ámbar por dolor sobre 4 o por alimentación bajo 80 %', () => {
    expect(outputsOf(input([{ ...GOOD, soreness: 5 }])).reasons).toEqual(['SORENESS']);
    const review = outputsOf(input([{ ...GOOD, nutritionCompliancePct: 75 }], 1.05));

    expect(review.light).toBe('AMBER');
    expect(review.reasons).toEqual(['NUTRITION']);
    expect(review.suggestedVolumeFactor).toBeCloseTo(0.945, 10);
    expect(review.suggestedAction).toBe('ADJUST');
  });

  it('el rojo manda sobre el ámbar y solo cita sus razones', () => {
    const review = outputsOf(input([{ ...GOOD, performancePct: 80, fatigue: 5 }]));

    expect(review.light).toBe('RED');
    expect(review.reasons).toEqual(['PERFORMANCE']);
  });

  it('en el umbral no cambia de color: rendimiento 90 %, sueño 6.5 h, fatiga 4 y alimentación 80 %', () => {
    const review = outputsOf(
      input([
        {
          ...GOOD,
          performancePct: 90,
          sleepHours: 6.5,
          fatigue: 4,
          soreness: 4,
          nutritionCompliancePct: 80,
        },
      ]),
    );

    expect(review.light).toBe('GREEN');
    expect(review.reasons).toEqual([]);
    expect(review.suggestedVolumeFactor).toBe(1);
    expect(review.suggestedAction).toBe('CONTINUE');
  });

  it('con sesiones y sin otros datos es verde: la falta de un dato no es mal estado', () => {
    const review = outputsOf(input([day({ sessionMinutes: 50 })], 0.9));

    expect(review.light).toBe('GREEN');
    expect(review.suggestedVolumeFactor).toBe(0.9);
  });

  it('usa los umbrales de la organización que recibe', () => {
    expect(
      weeklyDecision({ ...aggregatesWith(85) }, 1, { ...V3, performanceMinPct: 80 }).light,
    ).toBe('GREEN');
  });

  it('devuelve el sobre del método con su versión', () => {
    const run = expectOk(runMethod(WEEKLY_REVIEW_JV, input([GOOD])));

    expect(run.methodCode).toBe('WEEKLY_REVIEW_JV');
    expect(run.methodVersion).toBe('3.1.0');
    expect(run.engineVersion).toBe(ENGINE_VERSION);
    expect(run.outputs.plannedVolumeFactor).toBe(1);
  });
});

describe('RN-G16 · P-21 · P-22 · la alimentación del check-in del domingo (ADR-109)', () => {
  it('manda sobre el promedio de los días: 70 % declarado el domingo es ámbar aunque los días digan 90 %', () => {
    const weekly = outputsOf({ ...input([GOOD, GOOD]), weeklyNutritionCompliancePct: 70 });
    expect(weekly.aggregates.avgNutritionCompliancePct).toBe(70);
    expect(weekly).toMatchObject({ light: 'AMBER', reasons: ['NUTRITION'] });
  });

  it('sin check-in, el promedio de los días, como antes: los controles que ya existen no cambian', () => {
    const before = expectOk(runMethod(WEEKLY_REVIEW_JV, input([GOOD, GOOD])));
    expect(before.outputs.aggregates.avgNutritionCompliancePct).toBe(90);
    expect(
      outputsOf({ ...input([GOOD]), weeklyNutritionCompliancePct: null }).aggregates
        .avgNutritionCompliancePct,
    ).toBe(90);
    expect(before.inputs).not.toHaveProperty('weeklyNutritionCompliancePct');
  });

  it('no calcula con una alimentación fuera de 0 a 100 o con decimales: NC-ENG-410', () => {
    for (const value of [101, -1, 85.5]) {
      expect(
        expectErrors(
          runMethod(WEEKLY_REVIEW_JV, { ...input([GOOD]), weeklyNutritionCompliancePct: value }),
        ),
      ).toEqual([{ rule: 'RN-G16', code: 'NC-ENG-410', severity: 'ERROR' }]);
    }
  });
});

describe('RN-G16 · insumos fuera de rango', () => {
  it.each([
    ['el sueño sobre 24 h', { sleepHours: 25 }],
    ['la fatiga en 0', { fatigue: 0 }],
    ['el dolor con decimales', { soreness: 2.5 }],
    ['el rendimiento sobre 120 %', { performancePct: 121 }],
    ['la alimentación sobre 100 %', { nutritionCompliancePct: 101 }],
    ['los síntomas sobre 3', { menstrualSymptoms: 4 }],
    ['los minutos negativos', { sessionMinutes: -1 }],
  ] as const)('no calcula con %s: NC-ENG-409', (_, values) => {
    expect(expectErrors(runMethod(WEEKLY_REVIEW_JV, input([day(values)])))).toEqual([
      { rule: 'RN-G16', code: 'NC-ENG-409', severity: 'ERROR' },
    ]);
  });

  it('no calcula con más de 7 días: NC-ENG-409', () => {
    expect(
      expectErrors(runMethod(WEEKLY_REVIEW_JV, input(Array.from({ length: 8 }, () => GOOD)))),
    ).toEqual([{ rule: 'RN-G16', code: 'NC-ENG-409', severity: 'ERROR' }]);
  });

  it.each([
    ['un factor del plan en 0', 0, {}],
    ['un factor del plan sobre 2', 2.1, {}],
    ['un sueño mínimo sobre 24 h', 1, { weeklySleepMinHours: 25 }],
    ['una alimentación mínima sobre 100 %', 1, { nutritionMinPct: 120 }],
  ] as const)('no calcula con %s: NC-ENG-410', (_, factor, thresholds) => {
    expect(expectErrors(runMethod(WEEKLY_REVIEW_JV, input([GOOD], factor, thresholds)))).toEqual([
      { rule: 'RN-G16', code: 'NC-ENG-410', severity: 'ERROR' },
    ]);
  });
});

function aggregatesWith(avgPerformancePct: number): WeeklyAggregates {
  return { sessions: 3, srpeLoad: 1200, ...NO_AVERAGES, avgPerformancePct };
}
