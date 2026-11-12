import { describe, expect, it } from 'vitest';
import { runMethod } from '../registry/run-method.js';
import {
  MESOCYCLE_REPORT_JV,
  type MesocycleExerciseOneRm,
  type MesocycleReportInput,
  type MesocycleReportWeek,
} from './mesocycle-report.js';

// Las semanas 1 a 4 del mesociclo de Mateo en la hoja piloto (del 06/10 al 02/11): series planificadas de la rutina completa y
// series hechas (P-29), 3 sesiones por semana (el 22/10 asistió, P-33) y los promedios de su control semanal.
const SHEET = [
  { planned: 60, done: 56, sleep: 6.4, stress: 3, fatigue: 3, performance: 80, nutrition: 78 },
  { planned: 64, done: 60, sleep: 6.8, stress: 4, fatigue: 4, performance: 80, nutrition: 82 },
  { planned: 68, done: 61, sleep: 7.1, stress: 3, fatigue: 3, performance: 100, nutrition: 88 },
  { planned: 48, done: 46, sleep: 7.4, stress: 2, fatigue: 2, performance: 100, nutrition: 92 },
];

const START = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'];
const END = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];

const week = (index: number, overrides: Partial<MesocycleReportWeek> = {}): MesocycleReportWeek => {
  const row = SHEET[index] as (typeof SHEET)[number];
  return {
    weekNo: index + 1,
    weekStart: START[index] as string,
    weekEnd: END[index] as string,
    plannedSets: row.planned,
    doneSets: row.done,
    sessionsPlanned: 3,
    sessionsDone: 3,
    sleepHours: row.sleep,
    stress: row.stress,
    fatigue: row.fatigue,
    performancePct: row.performance,
    nutritionPct: row.nutrition,
    ...overrides,
  };
};

const WEEKS = [0, 1, 2, 3].map((index) => week(index));

// El 1RM con Epley de lo que registró Mateo cada semana (12 repeticiones; 10 en la descarga de la semana 4).
const MATEO: MesocycleExerciseOneRm[] = [
  {
    exerciseId: 'press-banca',
    bestBeforeKg: null,
    days: [
      { localDate: '2026-10-06', estimated1rmKg: 56 },
      { localDate: '2026-10-13', estimated1rmKg: 59.5 },
      { localDate: '2026-10-20', estimated1rmKg: 63 },
      { localDate: '2026-10-27', estimated1rmKg: 35 * (1 + 10 / 30) },
    ],
  },
  {
    exerciseId: 'sentadilla',
    bestBeforeKg: null,
    days: [
      { localDate: '2026-10-08', estimated1rmKg: 84 },
      { localDate: '2026-10-15', estimated1rmKg: 87.5 },
      { localDate: '2026-10-22', estimated1rmKg: 91 },
      { localDate: '2026-10-29', estimated1rmKg: 50 * (1 + 10 / 30) },
    ],
  },
  {
    exerciseId: 'jalon',
    bestBeforeKg: null,
    days: [
      { localDate: '2026-10-10', estimated1rmKg: 63 },
      { localDate: '2026-10-17', estimated1rmKg: 66.5 },
      { localDate: '2026-10-24', estimated1rmKg: 70 },
      { localDate: '2026-10-31', estimated1rmKg: 40 * (1 + 10 / 30) },
    ],
  },
];

const report = (input: Partial<MesocycleReportInput> = {}) => {
  const run = runMethod(MESOCYCLE_REPORT_JV, {
    weeks: WEEKS,
    oneRmFormula: 'ONERM_EPLEY1985',
    exercises: MATEO,
    ...input,
  });
  if (!run.ok) throw new Error(JSON.stringify(run.errors));
  return run.result;
};

const errorsOf = (input: Partial<MesocycleReportInput>) => {
  const run = runMethod(MESOCYCLE_REPORT_JV, {
    weeks: WEEKS,
    oneRmFormula: 'ONERM_EPLEY1985',
    exercises: MATEO,
    ...input,
  });
  return run.ok ? null : run.errors.map((issue) => issue.code);
};

const oneExercise = (
  days: readonly [string, number][],
  bestBeforeKg: number | null = null,
): MesocycleExerciseOneRm[] => [
  {
    exerciseId: 'press-banca',
    bestBeforeKg,
    days: days.map(([localDate, estimated1rmKg]) => ({ localDate, estimated1rmKg })),
  },
];

describe('RN-G19 · P-28 y P-29 · informe del mesociclo de la hoja piloto', () => {
  it('G-44 · el mes de Mateo: 223 ÷ 240 = 92.9 % de volumen cumplido, semana 1 en 93.3 %, y los promedios de la hoja', () => {
    const result = report();
    expect(result.methodCode).toBe('MESOCYCLE_REPORT_JV');
    expect(result.methodVersion).toBe('1.0.0');
    const { total, weeks, averages } = result.outputs;
    expect(total).toMatchObject({
      plannedSets: 240,
      doneSets: 223,
      sessionsPlanned: 12,
      sessionsDone: 12,
    });
    expect(total.volumePct).toBeCloseTo(92.9167, 4);
    expect(weeks.map((row) => row.volumePct)).toEqual([
      (56 * 100) / 60,
      (60 * 100) / 64,
      (61 * 100) / 68,
      (46 * 100) / 48,
    ]);
    expect(weeks[0]?.volumePct).toBeCloseTo(93.3333, 4);
    // 6.4, 6.8, 7.1 y 7.4 h dan 6.925: la hoja muestra 6.9 h. Estrés y fatiga 3.0, rendimiento 90 % y alimentación 85 %.
    expect(averages.sleepHours).toBeCloseTo(6.925, 9);
    expect(averages).toMatchObject({ stress: 3, fatigue: 3, performancePct: 90, nutritionPct: 85 });
  });

  it('G-44 · récords de Mateo: ninguno en la semana 1 (es la primera vez), 3 en la 2 y en la 3, y ninguno en la descarga', () => {
    const { weeks, total, records } = report().outputs;
    expect(weeks.map((row) => row.records)).toEqual([0, 3, 3, 0]);
    expect(total.records).toBe(6);
    expect(records.filter((record) => record.weekNo === 2)).toEqual([
      {
        exerciseId: 'press-banca',
        weekNo: 2,
        localDate: '2026-10-13',
        estimated1rmKg: 59.5,
        previousBestKg: 56,
      },
      {
        exerciseId: 'sentadilla',
        weekNo: 2,
        localDate: '2026-10-15',
        estimated1rmKg: 87.5,
        previousBestKg: 84,
      },
      {
        exerciseId: 'jalon',
        weekNo: 2,
        localDate: '2026-10-17',
        estimated1rmKg: 66.5,
        previousBestKg: 63,
      },
    ]);
  });

  it('se compara con el mejor anterior, no con la sesión anterior: después de la descarga, 56.0 no supera los 63.0', () => {
    const weeks = [0, 1, 2, 3].map((index) => week(index));
    const fifth = week(3, {
      weekNo: 5,
      weekStart: '2026-11-03',
      weekEnd: '2026-11-09',
    });
    const exercises = oneExercise([
      ['2026-10-20', 63],
      ['2026-10-27', 35 * (1 + 10 / 30)],
      ['2026-11-03', 56],
    ]);
    const { outputs } = report({ weeks: [...weeks, fifth], exercises });
    expect(outputs.weeks.map((row) => row.records)).toEqual([0, 0, 0, 0, 0]);
  });

  it('el mejor de antes del mesociclo cuenta: superarlo en la semana 1 es récord; igualarlo no', () => {
    const beat = report({ exercises: oneExercise([['2026-10-06', 56]], 55) }).outputs;
    expect(beat.weeks[0]?.records).toBe(1);
    expect(beat.records[0]).toMatchObject({ previousBestKg: 55, estimated1rmKg: 56 });
    const tie = report({ exercises: oneExercise([['2026-10-06', 56]], 56) }).outputs;
    expect(tie.weeks[0]?.records).toBe(0);
  });

  it('un ejercicio cuenta una vez por semana, con el récord más alto y lo que superó ese día', () => {
    const { weeks, records } = report({
      exercises: oneExercise(
        [
          ['2026-10-07', 60],
          ['2026-10-09', 62],
        ],
        56,
      ),
    }).outputs;
    expect(weeks[0]?.records).toBe(1);
    expect(records).toEqual([
      {
        exerciseId: 'press-banca',
        weekNo: 1,
        localDate: '2026-10-09',
        estimated1rmKg: 62,
        previousBestKg: 60,
      },
    ]);
  });

  it('la primera vez no cuenta, pero superarla en la misma semana sí', () => {
    const { weeks } = report({
      exercises: oneExercise([
        ['2026-10-07', 60],
        ['2026-10-09', 61],
      ]),
    }).outputs;
    expect(weeks[0]?.records).toBe(1);
  });

  it('sin series planificadas no hay volumen cumplido; con más series de las planificadas pasa de 100 %', () => {
    const { weeks, total } = report({
      weeks: [week(0, { plannedSets: 0, doneSets: 0 }), week(1, { plannedSets: 10, doneSets: 12 })],
      exercises: [],
    }).outputs;
    expect(weeks.map((row) => row.volumePct)).toEqual([null, 120]);
    expect(total.volumePct).toBe(120);
  });

  it('los promedios usan las semanas con dato; sin ninguna, quedan sin dato', () => {
    const { averages } = report({
      weeks: [
        week(0, { sleepHours: null, nutritionPct: null }),
        week(1, { nutritionPct: null }),
        week(2, { nutritionPct: null }),
      ],
      exercises: [],
    }).outputs;
    expect(averages.sleepHours).toBeCloseTo((6.8 + 7.1) / 2, 9);
    expect(averages.nutritionPct).toBeNull();
  });

  it('semanas fuera de orden, cruzadas o con valores fuera de rango dan NC-ENG-417', () => {
    expect(errorsOf({ weeks: [], exercises: [] })).toEqual(['NC-ENG-417']);
    expect(errorsOf({ weeks: [week(1), week(0)], exercises: [] })).toEqual(['NC-ENG-417']);
    expect(
      errorsOf({ weeks: [week(0), week(1, { weekStart: '2026-10-12' })], exercises: [] }),
    ).toEqual(['NC-ENG-417']);
    expect(errorsOf({ weeks: [week(0, { doneSets: 1.5 })], exercises: [] })).toEqual([
      'NC-ENG-417',
    ]);
    expect(errorsOf({ weeks: [week(0, { stress: 6 })], exercises: [] })).toEqual(['NC-ENG-417']);
    expect(errorsOf({ weeks: [week(0, { weekEnd: '2026-02-30' })], exercises: [] })).toEqual([
      'NC-ENG-417',
    ]);
  });

  it('un ejercicio repetido, un día fuera del mesociclo o repetido, un 1RM no positivo o sin fórmula dan NC-ENG-418', () => {
    expect(errorsOf({ exercises: [...oneExercise([]), ...oneExercise([])] })).toEqual([
      'NC-ENG-418',
    ]);
    expect(errorsOf({ exercises: oneExercise([['2026-10-05', 50]]) })).toEqual(['NC-ENG-418']);
    expect(errorsOf({ exercises: oneExercise([['2026-11-03', 50]]) })).toEqual(['NC-ENG-418']);
    expect(
      errorsOf({
        exercises: oneExercise([
          ['2026-10-06', 50],
          ['2026-10-06', 52],
        ]),
      }),
    ).toEqual(['NC-ENG-418']);
    expect(errorsOf({ exercises: oneExercise([['2026-10-06', 0]]) })).toEqual(['NC-ENG-418']);
    expect(errorsOf({ exercises: oneExercise([], -1) })).toEqual(['NC-ENG-418']);
    expect(errorsOf({ oneRmFormula: ' ' })).toEqual(['NC-ENG-418']);
  });
});
