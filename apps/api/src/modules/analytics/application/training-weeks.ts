import { FRACTIONAL_SETS, RPE_FROM_RIR, runMethod, SFR, type MuscleRole } from '@nutricoach/engine';
import type { DaySet, DayFacts } from '../../tracking/index.js';
import type { FactorVersion } from '../domain/adjusted-volume.js';
import { CARDIO_MUSCLE } from '../domain/daily-summary.js';
import type { CalendarWeek } from '../domain/program-calendar.js';
import { adjustedVolumeOf } from './adjusted-volume.js';
import type { WeeklyMuscleRow } from './ports/analytics.ports.js';

/**
 * El volumen de cada semana del macrociclo por grupo muscular (RF-33, RN-F06 a RN-F09): lo hecho en las sesiones de esa semana del
 * programa contra lo programado, con el motor. Una sesión se cuenta en su semana aunque se haga otro día (ADR-083). Las series de
 * cardio van en minutos, no aquí (ADR-071). El tonelaje de una serie se reparte como las series: principal 1 y secundario 0.5
 * (ADR-088), y el volumen ajustado igual, con la tabla de factores vigente al empezar la semana (ADR-106).
 */

const roleOf = (weight: number): MuscleRole['role'] => (weight >= 1 ? 'PRIMARY' : 'SECONDARY');

const average = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
};

/** El RPE de una serie: el registrado o, con solo el RIR, 10 − RIR (RN-F05). */
function rpeOf(set: DaySet): number | null {
  if (set.rpe !== null) return set.rpe;
  if (set.rir === null) return null;
  const run = runMethod(RPE_FROM_RIR, { rir: set.rir });
  return run.ok ? run.result.outputs.rpe : null;
}

/** SFR con las series que tienen las dos valoraciones (RN-F07); sin ninguna, null. */
function sfrOf(sets: readonly DaySet[]): number | null {
  const ratings = sets.flatMap((set) =>
    set.stimulusRating !== null && set.fatigueRating !== null
      ? [{ stimulus: set.stimulusRating, fatigue: set.fatigueRating }]
      : [],
  );
  if (ratings.length === 0) return null;
  const run = runMethod(SFR, { ratings });
  return run.ok ? run.result.outputs.sfr : null;
}

export interface WeeklyInput {
  /** Las semanas del calendario que ya empezaron. */
  readonly weeks: readonly CalendarWeek[];
  readonly days: readonly DayFacts[];
  /** Las versiones de la línea del programa: los entrenos de otra línea no cuentan aquí. */
  readonly lineageProgramIds: ReadonlySet<string>;
  /** La última versión publicada de la línea. */
  readonly programId: string;
  /** La tabla de factores vigente un día (ADR-106). */
  readonly factorsOn: (localDate: string) => FactorVersion | null;
  /** El descanso prescrito de una serie en el programa con que se registró su entreno (ADR-106). */
  readonly restOf: (workout: DayFacts['workouts'][number], set: DaySet) => number | null;
}

export function weeklyMuscleRows(input: WeeklyInput): WeeklyMuscleRow[] {
  const setsByWeek = new Map<number, DaySet[]>();
  const restById = new Map<string, number | null>();
  for (const day of input.days) {
    for (const workout of day.workouts) {
      if (
        workout.outcome === 'SKIPPED' ||
        workout.weekNo === null ||
        workout.programId === null ||
        !input.lineageProgramIds.has(workout.programId)
      ) {
        continue;
      }
      setsByWeek.set(workout.weekNo, [...(setsByWeek.get(workout.weekNo) ?? []), ...workout.sets]);
      for (const set of workout.sets) restById.set(set.id, input.restOf(workout, set));
    }
  }
  return input.weeks.flatMap((week) => {
    const effective = (setsByWeek.get(week.weekNo) ?? []).filter((set) => !set.isWarmup);
    const run = runMethod(FRACTIONAL_SETS, {
      sets: effective.map((set) => ({ exercise: set.id, warmup: false })),
      muscleMap: Object.fromEntries(
        effective.map((set) => [
          set.id,
          set.muscleContributions.map((c) => ({ muscle: c.muscle, role: roleOf(c.weight) })),
        ]),
      ),
    });
    const done = run.ok ? run.result.outputs.setsByMuscle : {};
    const volume = adjustedVolumeOf(
      effective.map((set) => ({
        id: set.id,
        reps: set.reps,
        loadKg: set.loadKg,
        rir: set.rir,
        restSeconds: restById.get(set.id) ?? null,
      })),
      input.factorsOn(week.weekStart),
    );
    const muscles = [...new Set([...Object.keys(week.plannedByMuscle), ...Object.keys(done)])]
      .filter((muscle) => muscle !== CARDIO_MUSCLE)
      .sort();
    return muscles.map((muscle) => {
      const involved = effective.flatMap((set) => {
        const contribution = set.muscleContributions.find((c) => c.muscle === muscle);
        return contribution ? [{ set, weight: contribution.weight }] : [];
      });
      const sets = involved.map(({ set }) => set);
      const adjusted = involved.map(({ set, weight }) => {
        const value = volume.bySet.get(set.id) ?? null;
        return value === null ? null : value * weight;
      });
      return {
        weekStart: week.weekStart,
        muscleCode: muscle,
        programId: input.programId,
        mesocycleId: week.mesocycleId,
        weekNo: week.weekNo,
        isDeload: week.isDeload,
        fractionalSetsDone: done[muscle] ?? 0,
        fractionalSetsPlanned: week.plannedByMuscle[muscle] ?? 0,
        tonnageKg:
          involved.length === 0
            ? null
            : involved.reduce((total, { set, weight }) => total + set.tonnageKg * weight, 0),
        adjustedVolumeKg:
          involved.length === 0
            ? null
            : adjusted.reduce<number>((total, value) => total + (value ?? 0), 0),
        unfactoredSets:
          involved.length === 0 ? null : adjusted.filter((value) => value === null).length,
        avgRpe: average(sets.map(rpeOf)),
        avgStimulus: average(sets.map((set) => set.stimulusRating)),
        avgFatigue: average(sets.map((set) => set.fatigueRating)),
        sfr: sfrOf(sets),
      };
    });
  });
}
