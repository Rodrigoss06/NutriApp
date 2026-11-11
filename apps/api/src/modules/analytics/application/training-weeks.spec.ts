import { describe, expect, it } from 'vitest';
import type { DayFacts, DaySet } from '../../tracking/index.js';
import type { FactorVersion } from '../domain/adjusted-volume.js';
import type { CalendarWeek } from '../domain/program-calendar.js';
import { estimateOneRm } from './one-rm-estimate.js';
import { weeklyMuscleRows } from './training-weeks.js';

const WEEK: CalendarWeek = {
  weekNo: 1,
  weekStart: '2026-11-02',
  weekEnd: '2026-11-08',
  mesocycleId: 'm-1',
  isDeload: false,
  phaseEs: null,
  volumeFactor: null,
  targetRir: null,
  sessionsPlanned: 1,
  plannedByMuscle: {
    QUADRICEPS: 4,
    GLUTES: 4,
    HAMSTRINGS: 2,
    CHEST: 2,
    TRICEPS: 1,
    FRONT_DELTS: 1,
  },
  cardioMinutesPlanned: 0,
};

const SQUAT = [
  { muscle: 'QUADRICEPS', weight: 1 },
  { muscle: 'GLUTES', weight: 1 },
  { muscle: 'HAMSTRINGS', weight: 0.5 },
];
const BENCH = [
  { muscle: 'CHEST', weight: 1 },
  { muscle: 'TRICEPS', weight: 0.5 },
  { muscle: 'FRONT_DELTS', weight: 0.5 },
];

const set = (id: string, values: Partial<DaySet> = {}): DaySet => ({
  id,
  exerciseId: 'squat',
  setNo: 1,
  muscleContributions: SQUAT,
  isWarmup: false,
  reps: 8,
  loadKg: 100,
  rir: null,
  rpe: null,
  stimulusRating: null,
  fatigueRating: null,
  durationSeconds: null,
  tonnageKg: 800,
  ...values,
});

const day = (
  sets: readonly DaySet[],
  values: Partial<DayFacts['workouts'][number]> = {},
): DayFacts => ({
  localDate: '2026-11-03',
  target: null,
  foods: [],
  hydrationLogs: 0,
  waterMl: 0,
  bodyWeightKg: null,
  checkin: null,
  workouts: [
    {
      id: 'w-1',
      outcome: 'COMPLETED',
      programId: 'p-1',
      sessionId: null,
      mesocycleId: 'm-1',
      weekNo: 1,
      isDeload: false,
      durationMinutes: 60,
      sessionRpe: 7,
      sets,
      ...values,
    },
  ],
});

/** La sesión de G-21 y G-24: sentadilla 100×8, 100×8, 100×7 y press de banca 70×10, 70×9. */
const G21 = [
  set('s-1'),
  set('s-2'),
  set('s-3', { reps: 7, tonnageKg: 700 }),
  set('b-1', {
    exerciseId: 'bench',
    muscleContributions: BENCH,
    loadKg: 70,
    reps: 10,
    tonnageKg: 700,
  }),
  set('b-2', {
    exerciseId: 'bench',
    muscleContributions: BENCH,
    loadKg: 70,
    reps: 9,
    tonnageKg: 630,
  }),
];

/** P-26: la tabla de Jeremy, vigente desde antes de la semana (ADR-106). */
const JV_FACTORS: FactorVersion = {
  id: 'jv',
  organizationId: null,
  validFrom: '2026-01-01',
  rir: [0, 1, 2, 3, 4]
    .map((rir) => ({ from: rir, factor: 1 + (3 - rir) * 0.1, orMore: false }))
    .concat([{ from: 5, factor: 0.8, orMore: true }]),
  rest: [
    { from: 90, factor: 1, orMore: false },
    { from: 120, factor: 1, orMore: false },
  ],
};

const rowsOf = (
  days: readonly DayFacts[],
  ids = new Set(['p-1']),
  restOf: (set: DaySet) => number | null = () => 120,
) =>
  weeklyMuscleRows({
    weeks: [WEEK],
    days,
    lineageProgramIds: ids,
    programId: 'p-2',
    factorsOn: () => JV_FACTORS,
    restOf: (_workout, set) => restOf(set),
  });

describe('G-24 · RN-F06 · series fraccionadas de la semana contra lo programado', () => {
  it('cuádriceps 3, glúteo 3, isquiosurales 1.5, pectoral 2, tríceps 1 y deltoides anterior 1', () => {
    const done = Object.fromEntries(
      rowsOf([day(G21)]).map((row) => [row.muscleCode, row.fractionalSetsDone]),
    );

    expect(done).toEqual({
      CHEST: 2,
      FRONT_DELTS: 1,
      GLUTES: 3,
      HAMSTRINGS: 1.5,
      QUADRICEPS: 3,
      TRICEPS: 1,
    });
  });

  it('cada fila lleva la semana, su mesociclo, la descarga, lo programado y la última versión del programa', () => {
    const quads = rowsOf([day(G21)]).find((row) => row.muscleCode === 'QUADRICEPS');

    expect(quads).toMatchObject({
      weekStart: '2026-11-02',
      weekNo: 1,
      mesocycleId: 'm-1',
      isDeload: false,
      programId: 'p-2',
      fractionalSetsPlanned: 4,
    });
  });
});

describe('G-21 · RN-F03 · tonelaje por grupo, repartido como las series (ADR-088)', () => {
  it('el principal suma toda la serie y el secundario la mitad; el total de G-21 es 3630 kg', () => {
    const rows = rowsOf([day(G21)]);
    const tonnage = Object.fromEntries(rows.map((row) => [row.muscleCode, row.tonnageKg]));

    expect(tonnage.QUADRICEPS).toBe(2300);
    expect(tonnage.HAMSTRINGS).toBe(1150);
    expect(tonnage.CHEST).toBe(1330);
    expect(tonnage.TRICEPS).toBe(665);
    expect(G21.reduce((total, s) => total + s.tonnageKg, 0)).toBe(3630);
  });
});

describe('RN-F05 · RN-F07 · RPE, estímulo, fatiga y SFR por grupo', () => {
  it('el RPE registrado o 10 − RIR; el SFR del motor con las series que tienen las dos valoraciones', () => {
    const [chest] = rowsOf([
      day([
        set('b-1', { muscleContributions: BENCH, rpe: 8, stimulusRating: 4, fatigueRating: 2 }),
        set('b-2', { muscleContributions: BENCH, rir: 1, stimulusRating: 5, fatigueRating: 3 }),
        set('b-3', { muscleContributions: BENCH, stimulusRating: 3 }),
      ]),
    ]).filter((row) => row.muscleCode === 'CHEST');

    expect(chest?.avgRpe).toBe(8.5);
    expect(chest?.avgStimulus).toBe(4);
    expect(chest?.avgFatigue).toBe(2.5);
    expect(chest?.sfr).toBeCloseTo(4.5 / 2.5, 10);
  });

  it('sin valoraciones, sin SFR', () => {
    expect(rowsOf([day(G21)]).every((row) => row.sfr === null && row.avgStimulus === null)).toBe(
      true,
    );
  });
});

describe('RN-F09 · qué cuenta en la semana', () => {
  it('lo programado y no hecho queda en 0; el calentamiento, lo omitido y otra línea no cuentan', () => {
    const rows = rowsOf([
      day([set('s-1', { isWarmup: true })]),
      day([set('s-2')], { id: 'w-2', outcome: 'SKIPPED' }),
      day([set('s-3')], { id: 'w-3', programId: 'other' }),
    ]);

    expect(rows.every((row) => row.fractionalSetsDone === 0)).toBe(true);
    expect(rows.map((row) => row.muscleCode)).toContain('CHEST');
  });

  it('el cardio no es volumen por grupo (ADR-071) y una sesión cuenta en su semana del programa', () => {
    const cardio = set('c-1', {
      muscleContributions: [{ muscle: 'CARDIO', weight: 1 }],
      tonnageKg: 0,
      durationSeconds: 1200,
    });
    const rows = rowsOf([day([cardio]), day([set('s-1')], { id: 'w-2', weekNo: 2 })]);

    expect(rows.find((row) => row.muscleCode === 'CARDIO')).toBeUndefined();
    expect(rows.find((row) => row.muscleCode === 'QUADRICEPS')?.fractionalSetsDone).toBe(0);
  });
});

describe('P-26 · ADR-106 · volumen ajustado por grupo, repartido como las series', () => {
  it('la hoja: 3 × 12 × 45 kg con RIR 2 y 120 s da 1,782 al principal y la mitad al secundario', () => {
    const sets = ['s-1', 's-2', 's-3'].map((id) =>
      set(id, { reps: 12, loadKg: 45, rir: 2, tonnageKg: 540 }),
    );
    const rows = rowsOf([day(sets)]);
    const quads = rows.find((row) => row.muscleCode === 'QUADRICEPS');
    const hamstrings = rows.find((row) => row.muscleCode === 'HAMSTRINGS');
    expect(quads?.adjustedVolumeKg).toBeCloseTo(1_782, 6);
    expect(quads?.unfactoredSets).toBe(0);
    expect(hamstrings?.adjustedVolumeKg).toBeCloseTo(891, 6);
  });

  it('sin RIR ni RPE, o sin descanso prescrito, queda «sin factor» y no suma; con solo el RPE y 100 s, sí (ADR-113)', () => {
    const sets = [
      set('con-factor', { reps: 12, loadKg: 45, rir: 2, tonnageKg: 540 }),
      set('sin-rir', { reps: 12, loadKg: 45, rir: null, tonnageKg: 540 }),
      set('sin-descanso', { reps: 12, loadKg: 45, rir: 2, tonnageKg: 540 }),
      // RPE 8 = RIR 2 (1.1) y 100 s = 1.00, por tramos: 594 más.
      set('solo-rpe', { reps: 12, loadKg: 45, rir: null, rpe: 8, tonnageKg: 540 }),
    ];
    const quads = rowsOf([day(sets)], new Set(['p-1']), (candidate) =>
      candidate.id === 'sin-descanso' ? null : candidate.id === 'solo-rpe' ? 100 : 120,
    ).find((row) => row.muscleCode === 'QUADRICEPS');
    expect(quads?.adjustedVolumeKg).toBeCloseTo(1_188, 6);
    expect(quads?.unfactoredSets).toBe(2);
  });
});

describe('G-22 · RN-F04 · el 1RM con el motor', () => {
  it('100 kg × 8: Epley 126.7 kg y Brzycki 124.1 kg; otra fórmula, sin estimación', () => {
    expect(estimateOneRm('ONERM_EPLEY1985', 100, 8)).toBeCloseTo(126.67, 2);
    expect(estimateOneRm('ONERM_BRZYCKI1993', 100, 8)).toBeCloseTo(124.14, 2);
    expect(estimateOneRm('OTRA', 100, 8)).toBeNull();
    expect(estimateOneRm('ONERM_EPLEY1985', 100, 13)).toBeNull();
  });
});
