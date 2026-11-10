import { defineMethod } from '../registry/run-method.js';

/** Una fila de una tabla de factores: el valor desde el que vale y, si `orMore`, también para todo lo que es mayor. */
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

/** El factor de un valor: la fila exacta o la última «o más» que lo alcanza; si no, null («sin factor»). */
function factorOf(rows: readonly VolumeFactorRow[], value: number | null): number | null {
  if (value === null) return null;
  const exact = rows.find((row) => row.from === value);
  if (exact) return exact.factor;
  let open: VolumeFactorRow | null = null;
  for (const row of rows) {
    if (row.orMore && row.from <= value && (open === null || row.from > open.from)) open = row;
  }
  return open?.factor ?? null;
}

const badTable = (rows: readonly VolumeFactorRow[]): boolean =>
  rows.some(
    (row) => !(Number.isFinite(row.factor) && row.factor > 0) || !Number.isFinite(row.from),
  ) || new Set(rows.map((row) => row.from)).size !== rows.length;

const negative = (value: number | null): boolean =>
  value !== null && !(Number.isFinite(value) && value >= 0);

/**
 * El volumen ajustado de la hoja piloto de JV Fitness (P14.5, P-26): por serie, repeticiones × carga × factor RIR × factor del
 * descanso prescrito, con las tablas como datos versionados. Un RIR o un descanso que la tabla no trae queda «sin factor», nunca
 * como 1: la serie no entra en el ajustado y se cuenta aparte. Sin carga (peso corporal sin lastre, movilidad o cardio) la
 * serie aporta 0 kg. La cadencia y la ejecución no cambian el volumen.
 */
export const ADJUSTED_VOLUME = defineMethod<AdjustedVolumeInput, AdjustedVolumeOutput>({
  code: 'ADJUSTED_VOLUME',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['sets', 'factors'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, registro de cargas (P-26, respuestas de Jeremy del 2026-11-10): volumen × factor RIR × factor descanso',
  validity: [
    {
      rule: 'RN-F03',
      severity: 'ERROR',
      code: 'NC-ENG-411',
      message: 'Cada factor de la tabla es mayor que 0 y cada valor aparece una sola vez.',
      when: ({ factors }) => badTable(factors.rir) || badTable(factors.rest),
    },
    {
      rule: 'RN-F03',
      severity: 'ERROR',
      code: 'NC-ENG-412',
      message: 'Las repeticiones, la carga, el RIR y el descanso de una serie no son negativos.',
      when: ({ sets }) =>
        sets.some(
          (set) =>
            negative(set.reps) ||
            negative(set.loadKg) ||
            negative(set.rir) ||
            negative(set.restSeconds),
        ),
    },
  ],
  compute: ({ sets, factors }) => {
    const rows = sets.map((set): AdjustedVolumeRow => {
      const volumeKg = (set.reps ?? 0) * (set.loadKg ?? 0);
      const rirFactor = factorOf(factors.rir, set.rir);
      const restFactor = factorOf(factors.rest, set.restSeconds);
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
