/**
 * El contenido del ZIP de la exportación (RN-B04, ADR-131). Puro: recibe las filas y los archivos y devuelve cada entrada con su ruta.
 *
 * - LEEME.txt: qué trae y cómo leerlo.
 * - datos.json: todas las tablas, con sus filas tal como están en la base.
 * - csv/esquema.tabla.csv: una por tabla con filas, en UTF-8 con BOM para que Excel lea las tildes.
 * - archivos.csv: el índice de los archivos, con el id que las tablas nombran.
 * - fichas/, expediente/, fotos-de-progreso/, evidencias/, consentimientos/: los archivos, por su propósito.
 */

export interface ExportTableRows {
  readonly table: string;
  readonly rows: readonly Record<string, unknown>[];
}

export interface ExportFileContent {
  readonly id: string;
  readonly purpose: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: Uint8Array;
  readonly createdAt: Date;
  readonly content: Uint8Array;
}

export interface ArchiveEntry {
  readonly path: string;
  readonly content: Uint8Array;
  /** Los PDF, JPEG y PNG ya vienen comprimidos: se guardan tal cual. */
  readonly compress: boolean;
}

export const EXPORT_FOLDERS: Readonly<Record<string, string>> = {
  GENERATED_DOCUMENT: 'fichas',
  RECORD_DOCUMENT: 'expediente',
  PROGRESS_PHOTO: 'fotos-de-progreso',
  ASSESSMENT_EVIDENCE: 'evidencias',
  CONSENT_EVIDENCE: 'consentimientos',
};

const EXTENSION: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const encoder = new TextEncoder();
const text = (value: string): Uint8Array => encoder.encode(value);
const BOM = '﻿';

/** Una celda de CSV (RFC 4180): objetos y listas en JSON; un texto que empieza como fórmula, con un apóstrofo delante. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let raw: string;
  if (typeof value === 'string') {
    raw = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    raw = String(value);
  } else {
    raw = JSON.stringify(value);
  }
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

/** Las filas en CSV, con las columnas de todas las filas en el orden en que aparecen. Sin filas, null. */
export function toCsv(rows: readonly Record<string, unknown>[]): string | null {
  if (rows.length === 0) return null;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [columns.map(cell).join(',')];
  for (const row of rows) lines.push(columns.map((column) => cell(row[column])).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** La ruta de un archivo: su carpeta, el día en que se guardó y su id, que es el que nombran las tablas. */
export function filePath(
  file: Pick<ExportFileContent, 'id' | 'purpose' | 'mimeType' | 'createdAt'>,
): string {
  const folder = EXPORT_FOLDERS[file.purpose] ?? 'otros';
  const extension = EXTENSION[file.mimeType] ?? 'bin';
  return `${folder}/${file.createdAt.toISOString().slice(0, 10)}-${file.id}.${extension}`;
}

function readme(input: {
  readonly exportedAt: Date;
  readonly patientCode: string;
  readonly authorNotes: boolean;
  readonly tables: readonly ExportTableRows[];
  readonly files: number;
}): string {
  const withRows = input.tables.filter((t) => t.rows.length > 0).length;
  return [
    `Exportación de los datos del paciente ${input.patientCode}`,
    `Preparada el ${input.exportedAt.toISOString()} (hora UTC).`,
    '',
    'Qué trae:',
    `- datos.json: las ${String(input.tables.length)} tablas con datos del paciente, con sus filas tal como están guardadas.`,
    `- csv/: una planilla por tabla con filas (${String(withRows)}), en UTF-8. Las listas y los objetos van en JSON dentro de la celda.`,
    `- archivos.csv y las carpetas fichas, expediente, fotos-de-progreso, evidencias y consentimientos: los ${String(input.files)} archivos,`,
    '  cada uno con el id que nombran las tablas.',
    '',
    'Cómo leerlo:',
    '- Las fechas con hora están en UTC; los días del paciente (local_date), en su zona horaria.',
    '- Los números van sin redondear, con su unidad en el nombre de la columna (weight_kg, volume_ml, kcal).',
    '- Los resultados guardan su método y su versión: un número no se compara con el de otro método.',
    input.authorNotes
      ? '- Las notas clínicas «Solo el autor» van solo si las escribió quien pidió esta exportación.'
      : '- Las notas clínicas «Solo el autor» no van: las ve solo quien las escribió.',
    '',
    'Este archivo tiene datos de salud: guárdalo en un lugar seguro y no lo compartas sin el consentimiento del paciente.',
    '',
  ].join('\n');
}

export function archiveEntries(input: {
  readonly exportedAt: Date;
  readonly patientId: string;
  readonly patientCode: string;
  /** Si la pidió un miembro del equipo: las notas «Solo el autor» suyas van. */
  readonly authorNotes: boolean;
  readonly tables: readonly ExportTableRows[];
  readonly files: readonly ExportFileContent[];
}): ArchiveEntry[] {
  const data = {
    format: 'patient-export',
    version: 1,
    exportedAt: input.exportedAt.toISOString(),
    patientId: input.patientId,
    tables: Object.fromEntries(input.tables.map((t) => [t.table, t.rows])),
  };
  const entries: ArchiveEntry[] = [
    {
      path: 'LEEME.txt',
      content: text(readme({ ...input, files: input.files.length })),
      compress: true,
    },
    { path: 'datos.json', content: text(JSON.stringify(data, null, 2)), compress: true },
  ];
  for (const table of input.tables) {
    const csv = toCsv(table.rows);
    if (csv !== null)
      entries.push({ path: `csv/${table.table}.csv`, content: text(csv), compress: true });
  }
  const index = toCsv(
    input.files.map((file) => ({
      path: filePath(file),
      file_id: file.id,
      purpose: file.purpose,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      sha256: Buffer.from(file.sha256).toString('hex'),
      created_at: file.createdAt.toISOString(),
    })),
  );
  if (index !== null) entries.push({ path: 'archivos.csv', content: text(index), compress: true });
  for (const file of input.files) {
    entries.push({ path: filePath(file), content: file.content, compress: false });
  }
  return entries;
}
