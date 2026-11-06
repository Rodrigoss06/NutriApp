import type {
  OneRmSeries,
  TrainingAnalytics,
  TrainingMuscleWeek,
  TrainingWeek,
} from '@nutricoach/contracts';

export interface MesocycleGroup {
  readonly id: string;
  readonly name: string;
  readonly focus: string | null;
  readonly weeks: readonly TrainingWeek[];
}

/** RF-33: todo agrupado por mesociclo, en el orden del programa. */
export function mesocycleGroups(analytics: TrainingAnalytics): MesocycleGroup[] {
  return [...analytics.mesocycles]
    .sort((a, b) => a.position - b.position)
    .map((mesocycle) => ({
      id: mesocycle.id,
      name: mesocycle.name,
      focus: mesocycle.focus,
      weeks: analytics.weeks.filter((week) => week.mesocycleId === mesocycle.id),
    }))
    .filter((group) => group.weeks.length > 0);
}

/**
 * La semana de las series por grupo muscular: la pedida (`?semana=3`), si existe; si no, la última con series hechas; si
 * no, la última que ya empezó; si ninguna empezó, la primera, con lo programado.
 */
export function muscleWeekNo(
  weeks: readonly TrainingWeek[],
  requested: string | string[] | undefined,
): number | null {
  const asked = typeof requested === 'string' ? Number(requested) : Number.NaN;
  const pick =
    weeks.find((week) => week.weekNo === asked) ??
    weeks.findLast((week) => week.muscles.some((muscle) => muscle.setsDone > 0)) ??
    weeks.findLast((week) => week.started) ??
    weeks.at(0);
  return pick?.weekNo ?? null;
}

export interface NamedMuscleWeek extends TrainingMuscleWeek {
  readonly name: string;
}

/** Los grupos de la semana con su nombre del catálogo: primero los que tienen más series programadas. */
export function musclesInOrder(
  muscles: readonly TrainingMuscleWeek[],
  names: ReadonlyMap<string, string>,
): NamedMuscleWeek[] {
  return muscles
    .map((muscle) => ({ ...muscle, name: names.get(muscle.muscleCode) ?? muscle.muscleCode }))
    .sort(
      (a, b) =>
        (b.setsPlanned ?? -1) - (a.setsPlanned ?? -1) ||
        b.setsDone - a.setsDone ||
        a.name.localeCompare(b.name, 'es'),
    );
}

/** Cada serie de 1RM es un ejercicio con una fórmula: fórmulas distintas no comparten serie (RN-D03). */
export const oneRmKey = (series: OneRmSeries): string => `${series.exerciseId}:${series.formula}`;
