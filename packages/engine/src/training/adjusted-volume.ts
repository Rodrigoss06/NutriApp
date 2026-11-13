import { defineMethod } from '../registry/run-method.js';

/** Una fila de una tabla de factores: su valor y su factor; si `orMore`, vale también para todo lo que es mayor. */
export interface VolumeFactorRow {
  readonly from: number;
  readonly factor: number;
  readonly orMore: boolean;
}

/** Las tablas de factores del volumen ajustado, como datos versionados (P-26, ADR-106). */
export interface VolumeFactorTables {
  /** RIR → factor: 1.0 + (3 − RIR) × 0.1, de RIR 0 = 1.3 a RIR 5 o más = 0.8. */
  readonly rir: readonly VolumeFactorRow[];
  /** Descanso prescrito en segundos → factor: de 45 s = 1.15 a 180 s o más = 0.95. */
  readonly rest: readonly VolumeFactorRow[];
}

export interface AdjustedVolumeSet {
  readonly id: string;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  /** Con RPE y sin RIR, el RIR es 10 − RPE, entre 0 y 5 (RN-F05; P-26). */
  readonly rpe: number | null;
  /** El descanso prescrito de la serie. */
  readonly restSeconds: number | null;
}

export interface AdjustedVolumeInput {
  /** Solo las series efectivas: el calentamiento no cuenta (RN-F03). */
  readonly sets: readonly AdjustedVolumeSet[];
  readonly factors: VolumeFactorTables;
}

export interface AdjustedVolumeRow {
  readonly id: string;
  readonly volumeKg: number;
  readonly rirFactor: number | null;
  readonly restFactor: number | null;
  /** null: «sin factor». */
  readonly adjustedVolumeKg: number | null;
}

export interface AdjustedVolumeOutput {
  readonly sets: readonly AdjustedVolumeRow[];
  readonly volumeKg: number;
  /** La suma de las series con factor. */
  readonly adjustedVolumeKg: number;
  /** Las series con carga y «sin factor»: no entran en el ajustado. */
  readonly unfactoredSets: number;
}

/** La fila «o más» más alta que alcanza el valor, si hay una. */
function openRow(rows: readonly VolumeFactorRow[], value: number): VolumeFactorRow | null {
  let open: VolumeFactorRow | null = null;
  for (const row of rows) {
    if (row.orMore && row.from <= value && (open === null || row.from > open.from)) open = row;
  }
  return open;
}

const closedRows = (rows: readonly VolumeFactorRow[]): readonly VolumeFactorRow[] =>
  rows.filter((row) => !row.orMore).toSorted((a, b) => a.from - b.from);

/**
 * El factor RIR: la fila exacta, la «o más» que lo alcanza o, entre dos filas, la recta entre ellas, que es la fórmula de Jeremy
 * (1.0 + (3 − RIR) × 0.1): RIR 1.5 = 1.15. Fuera de la tabla, null («sin factor»).
 */
function rirFactorOf(rows: readonly VolumeFactorRow[], rir: number | null): number | null {
  if (rir === null) return null;
  const exact = rows.find((row) => row.from === rir);
  if (exact) return exact.factor;
  const open = openRow(rows, rir);
  if (open) return open.factor;
  // La recta llega hasta la fila «o más»: RIR 4.5 queda entre 4 (0.9) y 5 o más (0.8), en 0.85.
  const sorted = rows.toSorted((a, b) => a.from - b.from);
  const upper = sorted.findIndex((row) => row.from > rir);
  const below = sorted[upper - 1];
  const above = sorted[upper];
  if (upper < 1 || !below || !above) return null;
  return (
    below.factor + ((rir - below.from) / (above.from - below.from)) * (above.factor - below.factor)
  );
}

/**
 * El factor del descanso, por tramos (P-26, respuesta de Rodrigo del 2026-11-11): cada fila vale hasta su valor, la «o más» desde
 * el suyo, y entre la última fila y la «o más» vale la última. Con la tabla de Jeremy: hasta 45 s = 1.15, de 46 a 60 s = 1.10,
 * de 61 a 75 s = 1.05, de 76 a 179 s = 1.00 y 180 s o más = 0.95. Solo una tabla vacía deja la serie «sin factor».
 */
function restFactorOf(rows: readonly VolumeFactorRow[], restSeconds: number | null): number | null {
  if (restSeconds === null) return null;
  const open = openRow(rows, restSeconds);
  if (open) return open.factor;
  const closed = closedRows(rows);
  return (closed.find((row) => row.from >= restSeconds) ?? closed.at(-1))?.factor ?? null;
}

/** El RIR de la serie: el registrado o, con solo el RPE, 10 − RPE entre 0 y 5 (RN-F05). */
const rirOf = (set: AdjustedVolumeSet): number | null =>
  set.rir ?? (set.rpe === null ? null : Math.min(5, Math.max(0, 10 - set.rpe)));

const badTable = (rows: readonly VolumeFactorRow[]): boolean =>
  rows.some(
    (row) => !(Number.isFinite(row.factor) && row.factor > 0) || !Number.isFinite(row.from),
  ) || new Set(rows.map((row) => row.from)).size !== rows.length;

const negative = (value: number | null): boolean =>
  value !== null && !(Number.isFinite(value) && value >= 0);

/**
 * El volumen ajustado de la hoja piloto de JV Fitness (P14.5, P-26): por serie, repeticiones × carga × factor RIR × factor del
 * descanso prescrito, con las tablas como datos versionados. 1.1.0 (ADR-113): el descanso va por tramos, el RIR entre dos filas
 * sigue la fórmula y, con RPE y sin RIR, el RIR es 10 − RPE entre 0 y 5. Sin RIR ni RPE, o sin descanso prescrito, la serie
 * queda «sin factor», nunca como 1: no entra en el ajustado y se cuenta aparte. Sin carga (peso corporal sin lastre, movilidad o
 * cardio) la serie aporta 0 kg. La cadencia y la ejecución no cambian el volumen.
 */
export const ADJUSTED_VOLUME = defineMethod<AdjustedVolumeInput, AdjustedVolumeOutput>({
  code: 'ADJUSTED_VOLUME',
  version: '1.1.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['sets', 'factors'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, registro de cargas (P-26, respuestas de Jeremy del 2026-11-10 y de Rodrigo del 2026-11-11): volumen × factor RIR × factor descanso',
  validity: [
    {
      rule: 'RN-F18',
      severity: 'ERROR',
      code: 'NC-ENG-411',
      message: 'Cada factor de la tabla es mayor que 0 y cada valor aparece una sola vez.',
      when: ({ factors }) => badTable(factors.rir) || badTable(factors.rest),
    },
    {
      rule: 'RN-F18',
      severity: 'ERROR',
      code: 'NC-ENG-412',
      message:
        'Las repeticiones, la carga, el RIR y el descanso de una serie no son negativos, y el RPE va de 0 a 10.',
      when: ({ sets }) =>
        sets.some(
          (set) =>
            negative(set.reps) ||
            negative(set.loadKg) ||
            negative(set.rir) ||
            negative(set.rpe) ||
            (set.rpe !== null && set.rpe > 10) ||
            negative(set.restSeconds),
        ),
    },
  ],
  compute: ({ sets, factors }) => {
    const rows = sets.map((set): AdjustedVolumeRow => {
      const volumeKg = (set.reps ?? 0) * (set.loadKg ?? 0);
      const rirFactor = rirFactorOf(factors.rir, rirOf(set));
      const restFactor = restFactorOf(factors.rest, set.restSeconds);
      const adjustedVolumeKg =
        volumeKg === 0
          ? 0
          : rirFactor === null || restFactor === null
            ? null
            : volumeKg * rirFactor * restFactor;
      return { id: set.id, volumeKg, rirFactor, restFactor, adjustedVolumeKg };
    });
    return {
      outputs: {
        sets: rows,
        volumeKg: rows.reduce((total, row) => total + row.volumeKg, 0),
        adjustedVolumeKg: rows.reduce((total, row) => total + (row.adjustedVolumeKg ?? 0), 0),
        unfactoredSets: rows.filter((row) => row.adjustedVolumeKg === null).length,
      },
    };
  },
});
