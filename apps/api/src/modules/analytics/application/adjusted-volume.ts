import { ADJUSTED_VOLUME, runMethod } from '@nutricoach/engine';
import type { FactorVersion } from '../domain/adjusted-volume.js';

/** Una serie efectiva con su descanso prescrito (P-26). */
export interface VolumeSet {
  readonly id: string;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  readonly restSeconds: number | null;
}

export interface SetsVolume {
  /** El ajustado de cada serie; null: «sin factor». */
  readonly bySet: ReadonlyMap<string, number | null>;
  readonly adjustedVolumeKg: number;
  readonly unfactoredSets: number;
}

/**
 * El volumen ajustado de unas series con el motor (ADJUSTED_VOLUME, ADR-106) y la tabla vigente. Sin tabla vigente, o si el motor
 * rechaza los insumos, las series con carga quedan «sin factor»: nunca se cuentan como 1.
 */
export function adjustedVolumeOf(
  sets: readonly VolumeSet[],
  factors: FactorVersion | null,
): SetsVolume {
  const run = runMethod(ADJUSTED_VOLUME, {
    sets,
    factors: { rir: factors?.rir ?? [], rest: factors?.rest ?? [] },
  });
  if (!run.ok) {
    const loaded = sets.filter((set) => (set.reps ?? 0) * (set.loadKg ?? 0) !== 0);
    return {
      bySet: new Map(sets.map((set) => [set.id, loaded.includes(set) ? null : 0])),
      adjustedVolumeKg: 0,
      unfactoredSets: loaded.length,
    };
  }
  const { outputs } = run.result;
  return {
    bySet: new Map(outputs.sets.map((row) => [row.id, row.adjustedVolumeKg])),
    adjustedVolumeKg: outputs.adjustedVolumeKg,
    unfactoredSets: outputs.unfactoredSets,
  };
}
