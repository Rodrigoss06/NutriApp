/**
 * El 1RM estimado de cada día (05.3 `analytics.exercise_one_rm_series`, RN-F04): por ejercicio, el mejor de sus series efectivas con
 * la fórmula del programa del paciente. Con más de 12 repeticiones no se estima. Puro: la estimación la hace el motor.
 */

export interface OneRmDay {
  readonly localDate: string;
  readonly workouts: readonly {
    readonly outcome: 'COMPLETED' | 'PARTIAL' | 'SKIPPED';
    readonly programId: string | null;
    readonly sets: readonly {
      readonly id: string;
      readonly exerciseId: string;
      readonly isWarmup: boolean;
      readonly reps: number | null;
      readonly loadKg: number | null;
    }[];
  }[];
}

/** El 1RM de una serie con la fórmula dada; null si el motor no lo estima. */
export type OneRmEstimate = (formula: string, loadKg: number, reps: number) => number | null;

export interface OneRmPoint {
  readonly localDate: string;
  readonly exerciseId: string;
  readonly formula: string;
  readonly bestEstimated1rmKg: number;
  readonly sourceSetId: string;
}

export const ONE_RM_MAX_REPS = 12;

/** Los mejores 1RM del día por ejercicio y fórmula; a igual estimación, la primera serie. */
export function oneRmPoints(
  day: OneRmDay,
  formulaOf: (programId: string) => string | null,
  estimate: OneRmEstimate,
): OneRmPoint[] {
  const best = new Map<string, OneRmPoint>();
  for (const workout of day.workouts) {
    if (workout.outcome === 'SKIPPED' || workout.programId === null) continue;
    const formula = formulaOf(workout.programId);
    if (formula === null) continue;
    for (const set of workout.sets) {
      const { reps, loadKg } = set;
      if (set.isWarmup || reps === null || loadKg === null) continue;
      if (!Number.isInteger(reps) || reps < 1 || reps > ONE_RM_MAX_REPS || !(loadKg > 0)) continue;
      const value = estimate(formula, loadKg, reps);
      if (value === null) continue;
      const key = `${set.exerciseId}|${formula}`;
      const current = best.get(key);
      if (!current || value > current.bestEstimated1rmKg) {
        best.set(key, {
          localDate: day.localDate,
          exerciseId: set.exerciseId,
          formula,
          bestEstimated1rmKg: value,
          sourceSetId: set.id,
        });
      }
    }
  }
  return [...best.values()];
}
