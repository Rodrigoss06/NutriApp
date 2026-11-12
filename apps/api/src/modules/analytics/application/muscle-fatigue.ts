import {
  MUSCLE_FATIGUE_JV,
  runMethod,
  type FamilyVolume,
  type MuscleFatigueRow,
  type MuscleFatigueThresholds,
  type MuscleVolume,
} from '@nutricoach/engine';
import type { FatiguePanelThresholdRow } from '../../training/index.js';
import { versionOn } from '../domain/adjusted-volume.js';
import { PANEL_BASE_WEEKS } from '../domain/fatigue-panel.js';
import type { PanelWeekInput } from './fatigue-panel.js';

/** El volumen ajustado de un grupo en una semana del programa, como lo guarda el volumen semanal (05.3), y por familia (P-27.2). */
export interface MuscleWeekVolume {
  readonly weekStart: string;
  readonly muscleCode: string;
  readonly adjustedVolumeKg: number | null;
  readonly familyVolumes: readonly FamilyVolume[] | null;
}

/**
 * La fatiga por grupo muscular de una semana (P-27; ADR-115), con la versión de los umbrales y el hash de sus insumos (RN-D01).
 * Los cambios llegan sin redondear (RN-D09).
 */
export interface MuscleFatigueWeek {
  readonly thresholdId: string;
  readonly inputsHash: string;
  /** Cuántas semanas previas entraron en la base (P-24). */
  readonly baseWeeks: number;
  readonly muscles: readonly MuscleFatigueRow[];
}

const thresholdsOf = (row: FatiguePanelThresholdRow): MuscleFatigueThresholds => ({
  loadAmberAbovePct: row.loadAmberAbovePct,
  loadRedAbovePct: row.loadRedAbovePct,
  recoveryGreenHours: row.muscleRecoveryGreenHours,
  recoveryAmberHours: row.muscleRecoveryAmberHours,
  recoveryRedHours: row.muscleRecoveryRedHours,
});

/**
 * La fatiga por grupo muscular de cada semana que ya empezó, con el motor (MUSCLE_FATIGUE_JV) y los umbrales del panel vigentes al
 * empezar la semana. La base son las mismas 3 semanas previas que la carga del panel: el motor deja fuera las que no tienen volumen
 * (P-24). Los coeficientes de cada grupo salen de su volumen por familia en la semana y de los de esa versión (P-27.1); de las
 * previas solo cuenta el volumen. Una semana que no empezó, o sin umbrales vigentes, queda en null. Solo informa: decide el control
 * semanal (P-25).
 */
export function muscleFatigueOf(
  weeks: readonly PanelWeekInput[],
  rows: readonly MuscleWeekVolume[],
  versions: readonly FatiguePanelThresholdRow[],
): Map<number, MuscleFatigueWeek | null> {
  const musclesOf = (weekStart: string, withFamilies: boolean): MuscleVolume[] =>
    rows
      .filter((row) => row.weekStart === weekStart)
      .map((row) => ({
        muscleCode: row.muscleCode,
        adjustedVolumeKg: row.adjustedVolumeKg,
        ...(withFamilies ? { families: row.familyVolumes ?? [] } : {}),
      }));
  const started = new Map(
    weeks.filter((week) => week.started).map((week) => [week.weekNo, week] as const),
  );
  return new Map(
    weeks.map((week) => {
      const version = week.started ? versionOn(versions, week.weekStart) : null;
      if (!version) return [week.weekNo, null] as const;
      const previousWeeks = [];
      for (let n = Math.max(1, week.weekNo - PANEL_BASE_WEEKS); n < week.weekNo; n += 1) {
        const previous = started.get(n);
        if (previous) {
          previousWeeks.push({
            adjustedVolumeKg: previous.adjustedVolumeKg,
            muscles: musclesOf(previous.weekStart, false),
          });
        }
      }
      const run = runMethod(MUSCLE_FATIGUE_JV, {
        muscles: musclesOf(week.weekStart, true),
        previousWeeks,
        thresholds: thresholdsOf(version),
        coefficients: version.familyCoefficients,
      });
      if (!run.ok) return [week.weekNo, null] as const;
      return [
        week.weekNo,
        {
          thresholdId: version.id,
          inputsHash: run.result.inputsHash,
          baseWeeks: run.result.outputs.baseWeeks,
          muscles: run.result.outputs.muscles,
        },
      ] as const;
    }),
  );
}
