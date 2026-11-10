/**
 * Lo que el panel de fatiga y recuperación necesita de cada semana del macrociclo (P14.5, PR 3; P-23 y P-24; ADR-108): los
 * promedios del registro diario de sus días y su volumen ajustado. Puro: el motor decide los colores (FATIGUE_PANEL_JV).
 */

/** Las semanas previas que entran en la base de la carga (P-24, «Prom. 3 sem.»). */
export const PANEL_BASE_WEEKS = 3;

export interface PanelDay {
  readonly stress: number | null;
  readonly sleepHours: number | null;
  readonly fatigue: number | null;
}

export interface PanelAverages {
  readonly avgStress: number | null;
  readonly avgSleepHours: number | null;
  readonly avgFatigue: number | null;
}

/** Promedio de lo que tiene dato, sin redondear (RN-D09); null si nada lo tiene: la falta de un dato no es mal estado. */
const averageOf = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
};

/**
 * El sueño se guarda con un decimal: se promedia en décimas, que suman exacto, para que 7 días de 7.1 h den 7.1 y no
 * 7.1000000000000005, y el umbral de 7 h no dependa del redondeo binario.
 */
const averageHours = (values: readonly (number | null)[]): number | null => {
  const tenths = averageOf(values.map((value) => (value === null ? null : Math.round(value * 10))));
  return tenths === null ? null : tenths / 10;
};

/** Los promedios de la semana con los registros diarios que traen cada dato (07 §10). */
export function panelAverages(days: readonly PanelDay[]): PanelAverages {
  return {
    avgStress: averageOf(days.map((day) => day.stress)),
    avgSleepHours: averageHours(days.map((day) => day.sleepHours)),
    avgFatigue: averageOf(days.map((day) => day.fatigue)),
  };
}

/**
 * El volumen ajustado de las semanas previas a la n, hasta 3, de la más antigua a la más reciente: las que no empezaron o no
 * existen no entran. El motor ignora las que no tienen volumen (P-24).
 */
export function previousVolumes(
  volumes: ReadonlyMap<number, number | null>,
  weekNo: number,
): (number | null)[] {
  const previous: (number | null)[] = [];
  for (let n = Math.max(1, weekNo - PANEL_BASE_WEEKS); n < weekNo; n += 1) {
    if (volumes.has(n)) previous.push(volumes.get(n) ?? null);
  }
  return previous;
}
