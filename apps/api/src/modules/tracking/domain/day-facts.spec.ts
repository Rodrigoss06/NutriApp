import { describe, expect, it } from 'vitest';
import {
  dayFacts,
  type FactAdjustment,
  type FactCheckin,
  type FactFood,
  type FactSet,
  type FactWorkout,
  type RawFacts,
} from './day-facts.js';

const DAY = '2026-11-02';
const NEXT = '2026-11-03';

const EMPTY: RawFacts = {
  targets: [],
  foods: [],
  hydration: [],
  metrics: [],
  checkins: [],
  workouts: [],
  sets: [],
  adjustments: [],
};

const food = (id: string, values: Partial<FactFood> = {}): FactFood => ({
  id,
  localDate: DAY,
  mealSlotCode: 'BREAKFAST',
  inPlan: true,
  servings: null,
  grams: 100,
  kcal: 380,
  choG: 60,
  proteinG: 13,
  fatG: 7,
  fiberG: 10,
  ...values,
});

const adjustment = (targetId: string, values: Partial<FactAdjustment> = {}): FactAdjustment => ({
  targetId,
  targetLocalDate: DAY,
  action: 'EXCLUDE',
  correctedValues: null,
  createdAt: new Date('2026-11-02T20:00:00Z'),
  ...values,
});

const workout: FactWorkout = {
  id: 'w-1',
  localDate: DAY,
  outcome: 'COMPLETED',
  programId: 'p-1',
  sessionId: null,
  mesocycleId: 'm-1',
  weekNo: 1,
  isDeload: false,
  durationMinutes: 50,
  sessionRpe: 7,
};

const set = (id: string, values: Partial<FactSet> = {}): FactSet => ({
  id,
  localDate: DAY,
  workoutLogId: 'w-1',
  exerciseId: 'e-1',
  setNo: 1,
  muscleContributions: [{ muscle: 'QUADRICEPS', weight: 1 }],
  isWarmup: false,
  reps: 8,
  loadKg: 60,
  rir: 2,
  rpe: null,
  stimulusRating: 4,
  fatigueRating: 3,
  durationSeconds: null,
  tonnageKg: 480,
  ...values,
});

const checkin: FactCheckin = {
  id: 'c-1',
  localDate: DAY,
  sessionMinutes: 50,
  sessionRpe: 7,
  sleepHours: 7,
  fatigue: 2,
  soreness: 2,
  stress: 3,
  motivation: 4,
  energy: null,
  menstrualSymptoms: null,
  nutritionCompliancePct: 90,
  restingHrBpm: null,
  hrvMs: null,
  performancePct: 100,
  srpeLoad: 350,
};

describe('RN-G09 · los días del rango', () => {
  it('trae cada día con meta o con algún registro, en orden', () => {
    const facts = dayFacts({
      ...EMPTY,
      targets: [
        {
          localDate: NEXT,
          nutritionPlanId: 'plan-1',
          kcal: 1835,
          choG: 184,
          proteinG: 160,
          fatG: 51,
          waterMl: 2500,
          plannedSessions: 1,
          plannedSets: { QUADRICEPS: 3 },
          dayKind: 'TRAINING',
          dayProfileCode: 'TRAINING',
          dayProfileName: 'Entrenamiento',
        },
      ],
      foods: [food('f-1')],
    });

    expect(facts.map((day) => day.localDate)).toEqual([DAY, NEXT]);
    expect(facts[0]?.target).toBeNull();
    expect(facts[1]?.target?.kcal).toBe(1835);
    expect(facts[1]?.target?.dayKind).toBe('TRAINING');
    expect(facts[1]?.foods).toEqual([]);
  });

  it('un día sin agua registrada no es lo mismo que 0 ml: lo dice el número de registros', () => {
    const [day] = dayFacts({ ...EMPTY, foods: [food('f-1')] });

    expect(day?.hydrationLogs).toBe(0);
    expect(day?.waterMl).toBe(0);
  });
});

describe('RN-G02 · la analítica usa el valor ajustado', () => {
  it('una comida excluida no cuenta; una corregida escala sus nutrientes y la fibra en proporción', () => {
    const [day] = dayFacts({
      ...EMPTY,
      foods: [food('f-1'), food('f-2')],
      adjustments: [
        adjustment('f-1'),
        adjustment('f-2', {
          action: 'CORRECT',
          correctedValues: {
            grams: 50,
            servings: null,
            kcal: 190,
            choG: 30,
            proteinG: 6.5,
            fatG: 3.5,
          },
        }),
      ],
    });

    expect(day?.foods).toEqual([
      {
        mealSlotCode: 'BREAKFAST',
        inPlan: true,
        kcal: 190,
        choG: 30,
        proteinG: 6.5,
        fatG: 3.5,
        fiberG: 5,
      },
    ]);
  });

  it('vale el ajuste más reciente, y el de otro día no se aplica', () => {
    const [day] = dayFacts({
      ...EMPTY,
      foods: [food('f-1')],
      adjustments: [
        adjustment('f-1', { createdAt: new Date('2026-11-02T20:00:00Z') }),
        adjustment('f-1', {
          action: 'CORRECT',
          correctedValues: { grams: 200, kcal: 760 },
          createdAt: new Date('2026-11-02T21:00:00Z'),
        }),
        adjustment('f-1', { targetLocalDate: NEXT, createdAt: new Date('2026-11-03T08:00:00Z') }),
      ],
    });

    expect(day?.foods[0]?.kcal).toBe(760);
    expect(day?.foods[0]?.fiberG).toBe(20);
  });

  it('el agua y el peso con sus ajustes; el peso es el último del día', () => {
    const [day] = dayFacts({
      ...EMPTY,
      hydration: [
        { id: 'h-1', localDate: DAY, volumeMl: 250 },
        { id: 'h-2', localDate: DAY, volumeMl: 250 },
      ],
      metrics: [
        {
          id: 'm-1',
          localDate: DAY,
          metricCode: 'BODY_WEIGHT',
          value: 62,
          measuredAt: new Date('2026-11-02T12:00:00Z'),
        },
        {
          id: 'm-2',
          localDate: DAY,
          metricCode: 'BODY_WEIGHT',
          value: 63.5,
          measuredAt: new Date('2026-11-02T14:00:00Z'),
        },
      ],
      adjustments: [
        adjustment('h-1'),
        adjustment('m-2', { action: 'CORRECT', correctedValues: { value: 62.8 } }),
      ],
    });

    expect(day?.waterMl).toBe(250);
    expect(day?.hydrationLogs).toBe(1);
    expect(day?.bodyWeightKg).toBe(62.8);
  });

  it('un registro diario excluido no cuenta', () => {
    const [day] = dayFacts({ ...EMPTY, checkins: [checkin], adjustments: [adjustment('c-1')] });

    expect(day?.checkin).toBeNull();
  });

  it('una serie corregida vale con su tonelaje nuevo; un entreno excluido se va con sus series', () => {
    const corrected = dayFacts({
      ...EMPTY,
      workouts: [workout],
      sets: [set('s-1'), set('s-2')],
      adjustments: [
        adjustment('s-1', {
          action: 'CORRECT',
          correctedValues: { reps: 10, loadKg: 60, tonnageKg: 600 },
        }),
        adjustment('s-2'),
        adjustment('w-1', { action: 'CORRECT', correctedValues: { durationMinutes: 45 } }),
      ],
    });
    const [day] = corrected;

    expect(day?.workouts[0]?.durationMinutes).toBe(45);
    expect(day?.workouts[0]?.sessionRpe).toBe(7);
    expect(day?.workouts[0]?.sets.map((s) => [s.id, s.reps, s.tonnageKg])).toEqual([
      ['s-1', 10, 600],
    ]);

    const excluded = dayFacts({
      ...EMPTY,
      workouts: [workout],
      sets: [set('s-1')],
      adjustments: [adjustment('w-1')],
    });
    expect(excluded[0]?.workouts).toEqual([]);
  });
});
