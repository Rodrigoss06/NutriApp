import { err, ok, type Result } from '@nutricoach/shared-kernel';
import { parseCsv, type CsvRecord } from './csv.js';

/** Los mensajes de una fila; row null: del archivo entero (codificación, sintaxis, encabezado). */
export interface ImportRowError {
  readonly row: number | null;
  readonly messages: readonly string[];
}

/**
 * Un tipo de catálogo que se importa desde CSV (RN-I04). Lo aporta el módulo dueño de los datos; el importador de la
 * plataforma pone el lote, el hash, la validación por fila y el informe.
 */
export interface CatalogImport<TRow> {
  /** Tipo del lote: TPCA_FOODS, COMPENDIUM_ACTIVITIES... */
  readonly kind: string;
  /** Encabezado exacto del archivo, en orden. */
  readonly columns: readonly string[];
  /** Valida una fila y la convierte; cada mensaje nombra su columna. */
  parse(record: Readonly<Record<string, string>>): Result<TRow, readonly string[]>;
  /** El código de la fila en la fuente: dos filas con el mismo son un error. */
  key(row: TRow): string;
  /** Guarda las filas válidas en la transacción del lote, con upserts: aplicar dos veces deja lo mismo. */
  save(rows: readonly TRow[]): Promise<void>;
}

/** Las filas válidas, listas para guardar, y los errores de las demás. */
export interface ValidatedFile<TRow> {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly errors: readonly ImportRowError[];
}

export type ImportStatus = 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'DUPLICATE';

/**
 * Valida el archivo fila por fila (RN-I04): el encabezado debe ser exactamente el del tipo y cada fila tener sus
 * columnas, pasar la validación del módulo y no repetir un código. Una fila mala no detiene a las demás. Falla entero
 * solo si no hay encabezado válido o filas.
 */
export function validateFile<TRow>(
  catalog: CatalogImport<TRow>,
  records: readonly CsvRecord[],
): Result<ValidatedFile<TRow>, string> {
  const [header, ...data] = records;
  if (!header) return err('El archivo está vacío.');
  if (header.cells.join(',') !== catalog.columns.join(',')) {
    return err(`El encabezado debe ser: ${catalog.columns.join(',')}`);
  }
  if (data.length === 0) return err('El archivo no tiene filas.');

  const rows: TRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Map<string, number>();
  for (const { row, cells } of data) {
    if (cells.length !== catalog.columns.length) {
      errors.push({
        row,
        messages: [
          `Tiene ${String(cells.length)} columnas y el encabezado ${String(catalog.columns.length)}.`,
        ],
      });
      continue;
    }
    const record = Object.fromEntries(catalog.columns.map((column, i) => [column, cells[i] ?? '']));
    const parsed = catalog.parse(record);
    if (!parsed.ok) {
      errors.push({ row, messages: parsed.error });
      continue;
    }
    const key = catalog.key(parsed.value);
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({
        row,
        messages: [`Código ${key} repetido: ya está en la fila ${String(first)}.`],
      });
      continue;
    }
    seen.set(key, row);
    rows.push(parsed.value);
  }
  return ok({ rows, total: data.length, errors });
}

/** Lee el archivo en UTF-8 estricto, lo parte como CSV y lo valida; un error de sintaxis falla el archivo entero. */
export function readCatalogFile<TRow>(
  catalog: CatalogImport<TRow>,
  content: Uint8Array,
): Result<ValidatedFile<TRow>, string> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return err('El archivo no está en UTF-8.');
  }
  const records = parseCsv(text);
  if (!records.ok) return err(`Fila ${String(records.error.row)}: ${records.error.message}`);
  return validateFile(catalog, records.value);
}

/** COMPLETED si todas las filas son válidas; con errores, se guardan las válidas; sin ninguna válida, FAILED. */
export const statusOf = (file: ValidatedFile<unknown>): ImportStatus => {
  if (file.rows.length === 0) return 'FAILED';
  return file.errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
};
