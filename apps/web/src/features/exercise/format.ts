import { EXERCISE_BASE_MEASURE_LABELS, type ExerciseDetail } from '@nutricoach/contracts';

type BaseValues = Pick<
  ExerciseDetail,
  'baseSets' | 'baseRepsMin' | 'baseRepsMax' | 'baseMeasure' | 'baseRestSeconds'
>;

/** «3 × 10 repeticiones», «3 × 8 a 12 repeticiones» o «1 × 20 minutos»; null si no tiene valores base. */
export function baseVolume(exercise: BaseValues): string | null {
  const { baseSets, baseRepsMin, baseRepsMax, baseMeasure } = exercise;
  if (baseSets === null || baseRepsMin === null) return null;
  const amount =
    baseRepsMax === null || baseRepsMax === baseRepsMin
      ? String(baseRepsMin)
      : `${String(baseRepsMin)} a ${String(baseRepsMax)}`;
  return `${String(baseSets)} × ${amount} ${EXERCISE_BASE_MEASURE_LABELS[baseMeasure]}`;
}

/** «90 s de descanso»; sin descanso o sin dato, null. */
export function baseRest({ baseRestSeconds }: BaseValues): string | null {
  return baseRestSeconds ? `${String(baseRestSeconds)} s de descanso` : null;
}
