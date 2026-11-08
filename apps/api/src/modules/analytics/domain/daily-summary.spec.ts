import { describe, expect, it } from 'vitest';
import {
  dailySummary,
  mealSlotsOf,
  nutrientTotal,
  type AdequacyRule,
  type SummaryDay,
  type SummaryFood,
} from './daily-summary.js';

const food = (values: Partial<SummaryFood> = {}): SummaryFood => ({
  mealSlotCode: 'BREAKFAST',
  inPlan: true,
  kcal: 400,
  choG: 50,
  proteinG: 20,
  fatG: 10,
  fiberG: 5,
  ...values,
});

const SET = {
  isWarmup: false,
  tonnageKg: 480,
  durationSeconds: null,
  muscleContributions: [{ muscle: 'QUADRICEPS', weight: 1 }],
};

const DAY: SummaryDay = {
  localDate: '2026-11-02',
  target: {
    kcal: 1835,
    choG: 184,
    proteinG: 160,
    fatG: 51,
    waterMl: 2500,
    plannedSessions: 1,
    dayKind: 'TRAINING',
  },
  foods: [],
  hydrationLogs: 0,
  waterMl: 0,
  bodyWeightKg: null,
  checkin: null,
  workouts: [],
};

/** Una regla de prueba: el porcentaje, en rango entre 90 y 110, y sin saberlo si falta un dato. */
const rule: AdequacyRule = (total, target) => {
  if (target === null || total.known === null) return { pct: null, inRange: null };
  const pct = (total.known * 100) / target;
  return { pct, inRange: total.missing > 0 ? null : pct >= 90 && pct <= 110 };
};

describe('RN-I03 · un dato que falta no es cero', () => {
  it('suma lo conocido y cuenta en cuántos registros falta', () => {
    expect(nutrientTotal([food(), food({ choG: null }), food({ choG: 30 })], 'choG')).toEqual({
      known: 80,
      missing: 1,
    });
  });

  it('un día sin comidas registradas no consumió 0: queda sin dato y sin adecuación', () => {
    const summary = dailySummary(DAY, ['BREAKFAST', 'LUNCH'], rule);

    expect(summary.kcal).toBeNull();
    expect(summary.adequacyKcalPct).toBeNull();
    expect(summary.kcalInRange).toBeNull();
    expect(summary.nutrientsMissing).toEqual({
      items: 0,
      kcal: 0,
      choG: 0,
      proteinG: 0,
      fatG: 0,
      fiberG: 0,
    });
    expect(summary.targetKcal).toBe(1835);
  });

  it('un día sin agua registrada no bebió 0 ml', () => {
    expect(dailySummary(DAY, null, rule).waterMl).toBeNull();
    expect(dailySummary({ ...DAY, hydrationLogs: 2, waterMl: 500 }, null, rule).waterMl).toBe(500);
  });

  it('con un nutriente faltante guarda lo conocido y en cuántos falta', () => {
    const summary = dailySummary(
      { ...DAY, foods: [food(), food({ proteinG: null, fiberG: null })] },
      null,
      rule,
    );

    expect(summary.proteinG).toBe(20);
    expect(summary.nutrientsMissing).toMatchObject({ items: 2, proteinG: 1, fiberG: 1, kcal: 0 });
  });
});

describe('RN-E10 · la adecuación del día contra su meta (RN-G03)', () => {
  it('cada nutriente contra su meta, y en rango según la regla', () => {
    const summary = dailySummary({ ...DAY, foods: [food({ kcal: 1835 })] }, null, rule);

    expect(summary.adequacyKcalPct).toBe(100);
    expect(summary.kcalInRange).toBe(true);
    expect(summary.adequacyChoPct).toBeCloseTo((50 * 100) / 184, 10);
  });

  it('07 §2 · un día de descanso se compara con su meta de descanso y guarda su tipo', () => {
    // La hoja piloto de JV Fitness: el día de descanso de Mateo, 2,250 kcal; comer el plan entero (2,500) da 111 %.
    const rest = {
      kcal: 2250,
      choG: 245,
      proteinG: 160,
      fatG: 70,
      waterMl: 3000,
      plannedSessions: 0,
      dayKind: 'REST' as const,
    };
    const summary = dailySummary(
      { ...DAY, target: rest, foods: [food({ kcal: 2500 })] },
      null,
      rule,
    );

    expect(summary.dayKind).toBe('REST');
    expect(summary.targetKcal).toBe(2250);
    expect(summary.adequacyKcalPct).toBeCloseTo((2500 * 100) / 2250, 10);
    expect(summary.kcalInRange).toBe(false);
  });

  it('sin meta ese día no hay adecuación', () => {
    const summary = dailySummary({ ...DAY, target: null, foods: [food()] }, null, rule);

    expect(summary.kcal).toBe(400);
    expect(summary.adequacyKcalPct).toBeNull();
    expect(summary.mealsPlanned).toBeNull();
    expect(summary.dayKind).toBeNull();
  });
});

describe('RF-32 · los tiempos de comida del día', () => {
  it('por tiempo: si el plan lo tenía y cuántos registros tuvo; lo de fuera del plan aparte', () => {
    expect(
      mealSlotsOf(
        [food(), food(), food({ mealSlotCode: 'SNACK', inPlan: false })],
        ['BREAKFAST', 'LUNCH'],
      ),
    ).toEqual({
      BREAKFAST: { planned: true, logged: 2 },
      LUNCH: { planned: true, logged: 0 },
      SNACK: { planned: false, logged: 1 },
    });
    const summary = dailySummary(
      { ...DAY, foods: [food(), food({ mealSlotCode: 'SNACK', inPlan: false })] },
      ['BREAKFAST', 'LUNCH'],
      rule,
    );
    expect([summary.mealsLogged, summary.mealsPlanned, summary.offPlanItems]).toEqual([2, 2, 1]);
  });
});

describe('RN-F03 · RN-F09 · el entrenamiento del día', () => {
  it('un entreno omitido no cuenta como hecho ni suma series; el calentamiento no es efectivo', () => {
    const summary = dailySummary(
      {
        ...DAY,
        workouts: [
          {
            outcome: 'COMPLETED',
            sets: [
              { ...SET, isWarmup: true, tonnageKg: 0 },
              { ...SET, tonnageKg: 480 },
              { ...SET, tonnageKg: 480 },
            ],
          },
          { outcome: 'SKIPPED', sets: [] },
        ],
      },
      null,
      rule,
    );

    expect([summary.workoutsDone, summary.workoutsPlanned]).toEqual([1, 1]);
    expect(summary.tonnageKg).toBe(960);
    expect(summary.effectiveSets).toBe(2);
  });

  it('sin entrenos, el tonelaje y las series quedan sin dato', () => {
    const summary = dailySummary(DAY, null, rule);

    expect([summary.workoutsDone, summary.tonnageKg, summary.effectiveSets]).toEqual([
      0,
      null,
      null,
    ]);
  });
});

describe('RN-G14 · RN-F09 · la carga sRPE y los minutos de cardio del día', () => {
  it('la carga sRPE es la que calculó la recuperación del registro diario; sin registro diario, sin dato', () => {
    const checkin = { stress: 2, sleepHours: 7, energy: null, srpeLoad: 350 };

    expect(dailySummary({ ...DAY, checkin }, null, rule).srpeLoad).toBe(350);
    expect(dailySummary(DAY, null, rule).srpeLoad).toBeNull();
  });

  it('los minutos de cardio salen de las series del grupo cardiorrespiratorio de los entrenos hechos', () => {
    const cardio = {
      ...SET,
      tonnageKg: 0,
      durationSeconds: 1200,
      muscleContributions: [{ muscle: 'CARDIO', weight: 1 }],
    };
    const summary = dailySummary(
      {
        ...DAY,
        workouts: [
          { outcome: 'COMPLETED', sets: [SET, cardio, { ...cardio, durationSeconds: 600 }] },
          { outcome: 'SKIPPED', sets: [cardio] },
        ],
      },
      null,
      rule,
    );

    expect(summary.cardioMinutes).toBe(30);
    expect(
      dailySummary({ ...DAY, workouts: [{ outcome: 'COMPLETED', sets: [SET] }] }, null, rule)
        .cardioMinutes,
    ).toBe(0);
    expect(dailySummary(DAY, null, rule).cardioMinutes).toBeNull();
  });
});
