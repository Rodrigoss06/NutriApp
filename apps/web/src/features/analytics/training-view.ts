import {
  formatNumber,
  type FatiguePanelWeek,
  type LoadLight,
  type OneRmSeries,
  type TrainingAnalytics,
  type TrainingMuscleWeek,
  type TrainingWeek,
} from '@nutricoach/contracts';

/**
 * El volumen ajustado con lo que quedó «sin factor» (P-26, ADR-106): «1,782 kg», «594 kg · 2 sin factor». Una serie sin factor no
 * se cuenta como 1: se dice aparte.
 */
export function adjustedText(
  adjustedVolumeKg: number | null,
  unfactoredSets: number | null,
): string {
  if (adjustedVolumeKg === null) return '—';
  const kg = `${formatNumber(adjustedVolumeKg, 'trainingLoad')} kg`;
  return unfactoredSets ? `${kg} · ${String(unfactoredSets)} sin factor` : kg;
}

/** El color del panel de fatiga (P-23, P-24): con ícono y texto, nunca solo color. */
export const FATIGUE_LIGHT_LABELS = {
  GREEN: 'Verde',
  AMBER: 'Ámbar',
  RED: 'Rojo',
  NO_DATA: 'Faltan datos',
  NO_BASE: 'Sin base',
} as const satisfies Record<LoadLight, string>;

export const FATIGUE_LIGHT_TONES = {
  GREEN: 'success',
  AMBER: 'warning',
  RED: 'danger',
  NO_DATA: 'info',
  NO_BASE: 'info',
} as const satisfies Record<LoadLight, 'success' | 'warning' | 'danger' | 'info'>;

/** El cambio de la carga frente a su base, con su signo: «+18.3 %», «−40.6 %». Sin base o sin volumen, nada. */
export function loadChangeText(fatigue: Pick<FatiguePanelWeek, 'loadChangePct'>): string | null {
  const change = fatigue.loadChangePct;
  if (change === null) return null;
  const text = `${formatNumber(Math.abs(change), 'percent')} %`;
  return change < 0 ? `−${text}` : `+${text}`;
}

/** Las semanas del panel: las que ya empezaron y tienen umbrales vigentes, en orden. */
export function fatigueWeeks(
  weeks: readonly TrainingWeek[],
): (TrainingWeek & { readonly fatigue: FatiguePanelWeek })[] {
  return weeks.flatMap((week) => (week.fatigue ? [{ ...week, fatigue: week.fatigue }] : []));
}

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
