import {
  parseEvaluationRow,
  parseMeasurementRow,
  parsePatientRow,
  parsePlanRow,
  TEMPLATE_COLUMNS,
  TEMPLATE_FILES,
  type Cells,
  type EvaluationRow,
  type MeasurementRow,
  type PatientRow,
  type PlanRow,
  type RowResult,
  type TemplateFile,
} from './account-template.js';

/** Un registro del CSV con su fila: la 1 es el encabezado, como en una hoja de cálculo. */
export interface TemplateRecord {
  readonly row: number;
  readonly cells: readonly string[];
}

/** Los mensajes de una fila; row null: del archivo entero (codificación, sintaxis, encabezado). */
export interface RowMessages {
  readonly row: number | null;
  readonly messages: readonly string[];
}

export interface ImportableEvaluation extends EvaluationRow {
  readonly measurements: readonly MeasurementRow[];
}

/** Un archivo leído: sus registros, o por qué no se pudo leer entero. */
export type TemplateInput = Readonly<
  Record<TemplateFile, { readonly records: readonly TemplateRecord[] } | { readonly error: string }>
>;

/** La carpeta validada: lo que puede entrar y los errores de cada archivo, sin tocar la base. */
export interface AccountTemplate {
  readonly patients: readonly PatientRow[];
  readonly evaluations: readonly ImportableEvaluation[];
  readonly plans: readonly PlanRow[];
  /** Filas con datos de cada archivo (sin el encabezado). */
  readonly totals: Readonly<Record<TemplateFile, number>>;
  readonly errors: Readonly<Record<TemplateFile, readonly RowMessages[]>>;
}

interface Parsed<T> {
  readonly valid: T[];
  readonly errors: RowMessages[];
  readonly total: number;
}

function parseFile<T extends { readonly row: number }>(
  file: TemplateFile,
  input: TemplateInput[TemplateFile],
  parse: (row: number, cells: Cells) => RowResult<T>,
  key: (row: T) => string | null,
): Parsed<T> {
  if ('error' in input)
    return { valid: [], errors: [{ row: null, messages: [input.error] }], total: 0 };
  const columns = TEMPLATE_COLUMNS[file];
  const [header, ...data] = input.records;
  if (!header || header.cells.join(',') !== columns.join(',')) {
    return {
      valid: [],
      errors: [{ row: null, messages: [`El encabezado debe ser: ${columns.join(',')}`] }],
      total: data.length,
    };
  }
  const valid: T[] = [];
  const errors: RowMessages[] = [];
  const seen = new Map<string, number>();
  for (const { row, cells } of data) {
    if (cells.length !== columns.length) {
      errors.push({
        row,
        messages: [
          `Tiene ${String(cells.length)} columnas y el encabezado ${String(columns.length)}.`,
        ],
      });
      continue;
    }
    const record = Object.fromEntries(
      columns.map((column, i) => [column, (cells[i] ?? '').trim()]),
    );
    const parsed = parse(row, record);
    if (!parsed.ok) {
      errors.push({ row, messages: parsed.messages });
      continue;
    }
    const k = key(parsed.value);
    if (k !== null) {
      const first = seen.get(k);
      if (first !== undefined) {
        errors.push({ row, messages: [`${k} repetido: ya está en la fila ${String(first)}.`] });
        continue;
      }
      seen.set(k, row);
    }
    valid.push(parsed.value);
  }
  return { valid, errors, total: data.length };
}

/**
 * Valida la carpeta de una cuenta (RN-I05): cada archivo con su encabezado exacto y cada fila con sus columnas; un id_origen
 * repetido, una evaluación o un plan cuyo paciente no está en pacientes.csv (o tiene errores), una toma de una evaluación que no
 * está, un sitio repetido en la misma evaluación y una evaluación sin tomas son errores de su fila. Una evaluación con alguna toma
 * mala no entra: entraría incompleta. Una fila mala no detiene a las demás.
 */
export function readTemplate(input: TemplateInput, today: string): AccountTemplate {
  const patients = parseFile(
    'pacientes',
    input.pacientes,
    (row, cells) => parsePatientRow(row, cells, today),
    (p) => `id_origen ${p.externalId}`,
  );
  const evaluations = parseFile(
    'evaluaciones',
    input.evaluaciones,
    (row, cells) => parseEvaluationRow(row, cells, today),
    (e) => `id_origen ${e.externalId}`,
  );
  const measurements = parseFile(
    'tomas',
    input.tomas,
    parseMeasurementRow,
    (t) => `el sitio ${t.siteCode} de la evaluación ${t.evaluationExternalId}`,
  );
  const plans = parseFile(
    'planes',
    input.planes,
    (row, cells) => parsePlanRow(row, cells, today),
    (p) => `id_origen ${p.externalId}`,
  );

  const patientIds = new Set(patients.valid.map((p) => p.externalId));
  const unknownPatient = (externalId: string): RowMessages['messages'] => [
    `id_paciente: ${externalId} no está en pacientes.csv o su fila tiene errores.`,
  ];

  const evaluationErrors = [...evaluations.errors];
  const withPatient = evaluations.valid.filter((e) => {
    if (patientIds.has(e.patientExternalId)) return true;
    evaluationErrors.push({ row: e.row, messages: unknownPatient(e.patientExternalId) });
    return false;
  });
  const evaluationIds = new Set(evaluations.valid.map((e) => e.externalId));
  const measurementErrors = [...measurements.errors];
  const byEvaluation = new Map<string, MeasurementRow[]>();
  for (const measurement of measurements.valid) {
    if (!evaluationIds.has(measurement.evaluationExternalId)) {
      measurementErrors.push({
        row: measurement.row,
        messages: [
          `id_evaluacion: ${measurement.evaluationExternalId} no está en evaluaciones.csv o su fila tiene errores.`,
        ],
      });
      continue;
    }
    const list = byEvaluation.get(measurement.evaluationExternalId) ?? [];
    list.push(measurement);
    byEvaluation.set(measurement.evaluationExternalId, list);
  }
  // Las tomas con error de cada evaluación, por su id: la evaluación no entra incompleta.
  const badMeasurements = new Map<string, number[]>();
  if (!('error' in input.tomas)) {
    const columns = TEMPLATE_COLUMNS.tomas;
    const index = columns.indexOf('id_evaluacion');
    const failedRows = new Set(measurements.errors.map((e) => e.row));
    for (const record of input.tomas.records.slice(1)) {
      if (!failedRows.has(record.row)) continue;
      const evaluation = (record.cells[index] ?? '').trim();
      badMeasurements.set(evaluation, [...(badMeasurements.get(evaluation) ?? []), record.row]);
    }
  }
  const importable: ImportableEvaluation[] = [];
  for (const evaluation of withPatient) {
    const bad = badMeasurements.get(evaluation.externalId);
    const own = byEvaluation.get(evaluation.externalId) ?? [];
    if (bad) {
      evaluationErrors.push({
        row: evaluation.row,
        messages: [`Tiene tomas con error en tomas.csv (fila ${bad.join(', ')}).`],
      });
    } else if (own.length === 0) {
      evaluationErrors.push({ row: evaluation.row, messages: ['No tiene tomas en tomas.csv.'] });
    } else {
      importable.push({ ...evaluation, measurements: own });
    }
  }

  // Las tomas buenas de una evaluación que no entra tampoco entran: quedan con su motivo.
  const importableIds = new Set(importable.map((e) => e.externalId));
  for (const [evaluationId, rows] of byEvaluation) {
    if (importableIds.has(evaluationId)) continue;
    for (const measurement of rows) {
      measurementErrors.push({
        row: measurement.row,
        messages: [
          `Su evaluación (id_origen ${evaluationId}) tiene errores en evaluaciones.csv o en sus tomas.`,
        ],
      });
    }
  }

  const planErrors = [...plans.errors];
  const importablePlans = plans.valid.filter((p) => {
    if (patientIds.has(p.patientExternalId)) return true;
    planErrors.push({ row: p.row, messages: unknownPatient(p.patientExternalId) });
    return false;
  });

  const byRow = (a: RowMessages, b: RowMessages) => (a.row ?? 0) - (b.row ?? 0);
  return {
    patients: patients.valid,
    evaluations: importable,
    plans: importablePlans,
    totals: {
      pacientes: patients.total,
      evaluaciones: evaluations.total,
      tomas: measurements.total,
      planes: plans.total,
    },
    errors: {
      pacientes: patients.errors.sort(byRow),
      evaluaciones: evaluationErrors.sort(byRow),
      tomas: measurementErrors.sort(byRow),
      planes: planErrors.sort(byRow),
    },
  };
}

export { TEMPLATE_FILES };

/**
 * El instante de una fecha y hora locales en una zona horaria (05 §2): busca el desplazamiento de la zona en ese momento con Intl,
 * dos veces por si cae en un cambio de horario.
 */
export function instantAt(localDate: string, minutesOfDay: number, timeZone: string): Date {
  const hours = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
  const minutes = String(minutesOfDay % 60).padStart(2, '0');
  const asUtc = Date.parse(`${localDate}T${hours}:${minutes}:00.000Z`);
  const offset = (at: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(at));
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const local = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second'),
    );
    return local - at;
  };
  const guess = asUtc - offset(asUtc);
  return new Date(asUtc - offset(guess));
}

/** La fecha local (AAAA-MM-DD) de un instante en una zona: el «hoy» de la organización. */
export function localDateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Hasta `size` elementos al azar, sin repetir, para el muestreo (RN-I05). `random` devuelve un número en [0, 1): la aplicación pasa
 * el de la plataforma y las pruebas uno fijo.
 */
export function pickSample<T>(items: readonly T[], size: number, random: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool.slice(0, Math.max(0, size));
}
