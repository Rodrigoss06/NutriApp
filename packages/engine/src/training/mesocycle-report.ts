import { defineMethod } from '../registry/run-method.js';
import { mean, sum } from '../stats.js';

/**
 * Una semana del mesociclo como la lee el informe (P-28, P-29): lo planificado y lo hecho, y el resumen de su control semanal
 * (07 §10).
 */
export interface MesocycleReportWeek {
  readonly weekNo: number;
  /** El primer y el último día de la semana del programa, como fecha local del paciente (07 §10). */
  readonly weekStart: string;
  readonly weekEnd: string;
  /** Las series de la rutina completa de la semana, sin calentamiento ni cardio (P-29). */
  readonly plannedSets: number;
  /** Las series registradas en las sesiones de esa semana del programa, sin calentamiento ni cardio. */
  readonly doneSets: number;
  readonly sessionsPlanned: number;
  readonly sessionsDone: number;
  /** Los promedios del control semanal de la semana; null sin control o sin dato. */
  readonly sleepHours: number | null;
  readonly stress: number | null;
  readonly fatigue: number | null;
  readonly performancePct: number | null;
  readonly nutritionPct: number | null;
}

/** El 1RM estimado de un ejercicio con la fórmula del paciente (RN-F04): el mejor de antes y el mejor de cada día del mesociclo. */
export interface MesocycleExerciseOneRm {
  readonly exerciseId: string;
  /** El mejor 1RM estimado antes de la primera semana; null si nunca lo hizo antes. */
  readonly bestBeforeKg: number | null;
  /** El mejor 1RM estimado de cada día en que lo hizo dentro del mesociclo. */
  readonly days: readonly { readonly localDate: string; readonly estimated1rmKg: number }[];
}

export interface MesocycleReportInput {
  /** Las semanas del mesociclo, en orden. */
  readonly weeks: readonly MesocycleReportWeek[];
  /** La fórmula de 1RM del paciente (RN-F04) con la que se estimaron los récords. */
  readonly oneRmFormula: string;
  readonly exercises: readonly MesocycleExerciseOneRm[];
}

export interface MesocycleReportWeekRow {
  readonly weekNo: number;
  readonly plannedSets: number;
  readonly doneSets: number;
  /** Volumen cumplido: series hechas × 100 ÷ planificadas, sin redondear (RN-F09, RN-D09); null sin series planificadas. */
  readonly volumePct: number | null;
  readonly sessionsPlanned: number;
  readonly sessionsDone: number;
  /** Los ejercicios con récord en la semana: cada uno cuenta una vez. */
  readonly records: number;
  readonly sleepHours: number | null;
  readonly stress: number | null;
  readonly fatigue: number | null;
  readonly performancePct: number | null;
  readonly nutritionPct: number | null;
}

/** Un récord: el mejor 1RM estimado de la semana de un ejercicio, sobre el mejor que tenía antes de esa semana. */
export interface MesocycleRecord {
  readonly exerciseId: string;
  readonly weekNo: number;
  readonly localDate: string;
  readonly estimated1rmKg: number;
  readonly previousBestKg: number;
}

export interface MesocycleReportOutput {
  readonly weeks: readonly MesocycleReportWeekRow[];
  readonly total: {
    readonly plannedSets: number;
    readonly doneSets: number;
    readonly volumePct: number | null;
    readonly sessionsPlanned: number;
    readonly sessionsDone: number;
    readonly records: number;
  };
  /** El promedio de las semanas con dato, como la hoja: 6.4, 6.8, 7.1 y 7.4 h dan 6.9 h. */
  readonly averages: {
    readonly sleepHours: number | null;
    readonly stress: number | null;
    readonly fatigue: number | null;
    readonly performancePct: number | null;
    readonly nutritionPct: number | null;
  };
  /** Por semana y, dentro de ella, por fecha (y por ejercicio el mismo día). */
  readonly records: readonly MesocycleRecord[];
}

/** Un mesociclo de JV Fitness tiene 4 semanas; el informe acepta hasta 12, como un macrociclo. */
const MAX_WEEKS = 12;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Una fecha del calendario AAAA-MM-DD que existe, sin reloj (el motor es puro). */
function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

const outside = (value: number | null, min: number, max: number): boolean =>
  value !== null && !(Number.isFinite(value) && value >= min && value <= max);

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/** Las semanas, en orden y sin huecos ni cruces, con sus conteos y los rangos del registro diario (RN-G11). */
function weeksInvalid(weeks: readonly MesocycleReportWeek[]): boolean {
  if (weeks.length === 0 || weeks.length > MAX_WEEKS) return true;
  return weeks.some((week, index) => {
    const previous = index === 0 ? null : (weeks[index - 1] as MesocycleReportWeek);
    return (
      !Number.isInteger(week.weekNo) ||
      week.weekNo < 1 ||
      (previous !== null && week.weekNo !== previous.weekNo + 1) ||
      !isDate(week.weekStart) ||
      !isDate(week.weekEnd) ||
      week.weekStart > week.weekEnd ||
      (previous !== null && week.weekStart <= previous.weekEnd) ||
      ![week.plannedSets, week.doneSets, week.sessionsPlanned, week.sessionsDone].every(isCount) ||
      outside(week.sleepHours, 0, 24) ||
      outside(week.stress, 1, 5) ||
      outside(week.fatigue, 1, 5) ||
      outside(week.performancePct, 0, 120) ||
      outside(week.nutritionPct, 0, 100)
    );
  });
}

/** Cada ejercicio una vez, cada día una vez y dentro del mesociclo, y los 1RM mayores que 0. */
function exercisesInvalid({ weeks, oneRmFormula, exercises }: MesocycleReportInput): boolean {
  const first = weeks[0]?.weekStart ?? '';
  const last = weeks.at(-1)?.weekEnd ?? '';
  return (
    oneRmFormula.trim() === '' ||
    new Set(exercises.map((exercise) => exercise.exerciseId)).size !== exercises.length ||
    exercises.some(
      (exercise) =>
        exercise.exerciseId.trim() === '' ||
        (exercise.bestBeforeKg !== null && !positive(exercise.bestBeforeKg)) ||
        new Set(exercise.days.map((day) => day.localDate)).size !== exercise.days.length ||
        exercise.days.some(
          (day) =>
            !isDate(day.localDate) ||
            day.localDate < first ||
            day.localDate > last ||
            !positive(day.estimated1rmKg),
        ),
    )
  );
}

const averageOf = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : mean(known);
};

const percentOf = (done: number, planned: number): number | null =>
  planned === 0 ? null : (done * 100) / planned;

/**
 * Los récords de un ejercicio (RN-G19): un 1RM estimado más alto que el mejor que tenía hasta ese día. La primera vez que lo hace no
 * cuenta, porque no hay nada que superar, y en cada semana cuenta una sola vez: con el último récord de la semana, que es el más alto.
 */
function recordsOf(
  exercise: MesocycleExerciseOneRm,
  weeks: readonly MesocycleReportWeek[],
): MesocycleRecord[] {
  const days = [...exercise.days].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const byWeek = new Map<number, MesocycleRecord>();
  let best = exercise.bestBeforeKg;
  for (const day of days) {
    const week = weeks.find((w) => day.localDate >= w.weekStart && day.localDate <= w.weekEnd);
    if (week && best !== null && day.estimated1rmKg > best) {
      byWeek.set(week.weekNo, {
        exerciseId: exercise.exerciseId,
        weekNo: week.weekNo,
        localDate: day.localDate,
        estimated1rmKg: day.estimated1rmKg,
        previousBestKg: best,
      });
    }
    best = best === null ? day.estimated1rmKg : Math.max(best, day.estimated1rmKg);
  }
  return [...byWeek.values()];
}

/**
 * El informe del mesociclo de JV Fitness (P14.5, PR 7; P-28 y P-29, respuestas de Rodrigo del 2026-11-10 y del 2026-11-11):
 * - volumen cumplido: series hechas ÷ planificadas de la rutina completa, por semana y en el mesociclo (223 ÷ 240 = 92.9 %);
 * - récords: un 1RM estimado más alto que el mejor anterior del mismo ejercicio; la primera vez no cuenta y cada ejercicio cuenta una
 *   vez por semana;
 * - el sueño, el estrés, la fatiga, el rendimiento y la alimentación de cada semana, del control semanal, y su promedio en las semanas
 *   con dato, como la hoja.
 * Solo informa: el coach escribe el logro, la limitante, el ajuste y la prioridad.
 */
export const MESOCYCLE_REPORT_JV = defineMethod<MesocycleReportInput, MesocycleReportOutput>({
  code: 'MESOCYCLE_REPORT_JV',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['weeks', 'oneRmFormula', 'exercises'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, informe mensual (P-28 y P-29, respuestas de Rodrigo del 2026-11-10 y del 2026-11-11)',
  validity: [
    {
      rule: 'RN-G19',
      severity: 'ERROR',
      code: 'NC-ENG-417',
      message:
        'Las semanas van en orden y sin cruces, de 1 a 12, con conteos enteros y los promedios dentro de los rangos del registro diario.',
      when: ({ weeks }) => weeksInvalid(weeks),
    },
    {
      rule: 'RN-G19',
      severity: 'ERROR',
      code: 'NC-ENG-418',
      message:
        'Cada ejercicio va una vez, con un 1RM por día dentro del mesociclo, mayor que 0, y la fórmula del paciente.',
      when: (input) => exercisesInvalid(input),
    },
  ],
  compute: ({ weeks, exercises }) => {
    const records = exercises
      .flatMap((exercise) => recordsOf(exercise, weeks))
      .sort(
        (a, b) =>
          a.weekNo - b.weekNo ||
          a.localDate.localeCompare(b.localDate) ||
          a.exerciseId.localeCompare(b.exerciseId),
      );
    const rows = weeks.map((week): MesocycleReportWeekRow => ({
      weekNo: week.weekNo,
      plannedSets: week.plannedSets,
      doneSets: week.doneSets,
      volumePct: percentOf(week.doneSets, week.plannedSets),
      sessionsPlanned: week.sessionsPlanned,
      sessionsDone: week.sessionsDone,
      records: records.filter((record) => record.weekNo === week.weekNo).length,
      sleepHours: week.sleepHours,
      stress: week.stress,
      fatigue: week.fatigue,
      performancePct: week.performancePct,
      nutritionPct: week.nutritionPct,
    }));
    const plannedSets = sum(weeks.map((week) => week.plannedSets));
    const doneSets = sum(weeks.map((week) => week.doneSets));
    return {
      outputs: {
        weeks: rows,
        total: {
          plannedSets,
          doneSets,
          volumePct: percentOf(doneSets, plannedSets),
          sessionsPlanned: sum(weeks.map((week) => week.sessionsPlanned)),
          sessionsDone: sum(weeks.map((week) => week.sessionsDone)),
          records: records.length,
        },
        averages: {
          sleepHours: averageOf(weeks.map((week) => week.sleepHours)),
          stress: averageOf(weeks.map((week) => week.stress)),
          fatigue: averageOf(weeks.map((week) => week.fatigue)),
          performancePct: averageOf(weeks.map((week) => week.performancePct)),
          nutritionPct: averageOf(weeks.map((week) => week.nutritionPct)),
        },
        records,
      },
    };
  },
});
