import {
  FATIGUE_PANEL_JV,
  runMethod,
  type FatigueLight,
  type FatiguePanelThresholds,
  type LoadLight,
} from '@nutricoach/engine';
import type { FatiguePanelThresholdRow } from '../../training/index.js';
import { versionOn } from '../domain/adjusted-volume.js';
import { panelAverages, previousVolumes, type PanelDay } from '../domain/fatigue-panel.js';
import type { CalendarWeek } from '../domain/program-calendar.js';

/** Una semana del macrociclo como la necesita el panel: si ya empezó, su volumen ajustado y sus días. */
export interface PanelWeekInput {
  readonly weekNo: number;
  readonly weekStart: string;
  readonly started: boolean;
  readonly adjustedVolumeKg: number | null;
  readonly days: readonly PanelDay[];
}

/** El panel de una semana (P-23, P-24; ADR-108), con la versión de los umbrales y el hash de sus insumos (RN-D01). */
export interface FatiguePanelWeek {
  readonly thresholdId: string;
  readonly inputsHash: string;
  readonly avgStress: number | null;
  readonly avgSleepHours: number | null;
  readonly avgFatigue: number | null;
  readonly adjustedVolumeKg: number | null;
  readonly baseVolumeKg: number | null;
  readonly loadChangePct: number | null;
  readonly load: LoadLight;
  readonly recovery: FatigueLight;
  readonly perceivedFatigue: FatigueLight;
  readonly overall: FatigueLight;
}

/** Un día del resumen como lo usa el panel: su fecha, su registro diario y su volumen ajustado. */
export interface PanelSummaryDay extends PanelDay {
  readonly localDate: string;
  readonly adjustedVolumeKg: number | null;
}

/**
 * Las semanas del calendario con sus días del resumen, por fecha (07 §10): el volumen ajustado de la semana es la suma del de sus
 * días, como en la analítica de rutina; sin ningún día con volumen, null.
 */
export function panelWeeks(
  calendar: readonly CalendarWeek[],
  days: readonly PanelSummaryDay[],
  today: string,
): PanelWeekInput[] {
  return calendar.map((week) => {
    const inWeek = days.filter(
      (day) => day.localDate >= week.weekStart && day.localDate <= week.weekEnd,
    );
    const volumes = inWeek.flatMap((day) =>
      day.adjustedVolumeKg === null ? [] : [day.adjustedVolumeKg],
    );
    return {
      weekNo: week.weekNo,
      weekStart: week.weekStart,
      started: week.weekStart <= today,
      adjustedVolumeKg: volumes.length === 0 ? null : volumes.reduce((a, b) => a + b, 0),
      days: inWeek,
    };
  });
}

const thresholdsOf = (row: FatiguePanelThresholdRow): FatiguePanelThresholds => ({
  recoveryRedStressMin: row.recoveryRedStressMin,
  recoveryRedSleepBelowHours: row.recoveryRedSleepBelowHours,
  recoveryAmberStressMin: row.recoveryAmberStressMin,
  recoveryAmberSleepBelowHours: row.recoveryAmberSleepBelowHours,
  fatigueRedMin: row.fatigueRedMin,
  fatigueAmberMin: row.fatigueAmberMin,
  loadAmberAbovePct: row.loadAmberAbovePct,
  loadRedAbovePct: row.loadRedAbovePct,
});

/**
 * El panel de fatiga y recuperación de cada semana que ya empezó, con el motor (FATIGUE_PANEL_JV) y los umbrales vigentes al
 * empezar la semana. La base de la carga son las 3 semanas previas que tienen volumen (P-24). Una semana que no empezó, o sin
 * umbrales vigentes, queda en null. Solo informa: decide el control semanal (P-25).
 */
export function fatiguePanelOf(
  weeks: readonly PanelWeekInput[],
  versions: readonly FatiguePanelThresholdRow[],
): Map<number, FatiguePanelWeek | null> {
  const volumes = new Map(
    weeks
      .filter((week) => week.started)
      .map((week) => [week.weekNo, week.adjustedVolumeKg] as const),
  );
  return new Map(
    weeks.map((week) => {
      const version = week.started ? versionOn(versions, week.weekStart) : null;
      if (!version) return [week.weekNo, null] as const;
      const averages = panelAverages(week.days);
      const run = runMethod(FATIGUE_PANEL_JV, {
        ...averages,
        adjustedVolumeKg: week.adjustedVolumeKg,
        previousVolumesKg: previousVolumes(volumes, week.weekNo),
        thresholds: thresholdsOf(version),
      });
      if (!run.ok) return [week.weekNo, null] as const;
      return [
        week.weekNo,
        {
          thresholdId: version.id,
          inputsHash: run.result.inputsHash,
          ...averages,
          adjustedVolumeKg: week.adjustedVolumeKg,
          ...run.result.outputs,
        },
      ] as const;
    }),
  );
}
