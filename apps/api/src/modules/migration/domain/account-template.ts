/**
 * La plantilla CSV propia de la migración de cuentas (RF-40, RN-I05; ADR-135): una carpeta por cuenta de nutricionista con cuatro
 * archivos. Aquí se valida cada fila y se convierte a lo que esperan los casos de uso de cada contexto; cada mensaje nombra su
 * columna. Puro: sin E/S, sin reloj (el día de hoy llega como argumento).
 */

export type TemplateFile = 'pacientes' | 'evaluaciones' | 'tomas' | 'planes';

export const TEMPLATE_FILES: readonly TemplateFile[] = [
  'pacientes',
  'evaluaciones',
  'tomas',
  'planes',
];

/** El encabezado exacto de cada archivo, en orden. */
export const TEMPLATE_COLUMNS: Readonly<Record<TemplateFile, readonly string[]>> = {
  pacientes: [
    'id_origen',
    'nombres',
    'apellidos',
    'sexo',
    'fecha_nacimiento',
    'tipo_documento',
    'numero_documento',
    'telefono',
    'correo',
    'poblacion',
    'activo',
    'consentimiento_datos_salud',
  ],
  evaluaciones: [
    'id_origen',
    'id_paciente',
    'fecha',
    'nivel',
    'en_ayunas',
    'actividad_intensa_24h',
  ],
  tomas: ['id_evaluacion', 'sitio', 'toma_1', 'toma_2', 'toma_3', 'lado'],
  planes: [
    'id_origen',
    'id_paciente',
    'desde',
    'hasta',
    'kcal',
    'proteina_g',
    'grasa_g',
    'carbohidratos_g',
    'agua_ml',
    'indicaciones',
  ],
};

export type Sex = 'M' | 'F';
export type DocumentType = 'DNI' | 'CE' | 'PASAPORTE' | 'OTRO';
export type Population = 'ADULT' | 'ATHLETE' | 'CHILD' | 'ADOLESCENT' | 'OBESITY' | 'OLDER_ADULT';
export type EvaluationLevel = 'BASIC' | 'ISAK1' | 'ISAK2';
export type MeasurementSide = 'RIGHT' | 'LEFT';

/** La población en la plantilla, en español; vacía es ADULTO, como en el alta de la app. */
export const POPULATION_CODES: Readonly<Record<string, Population>> = {
  ADULTO: 'ADULT',
  DEPORTISTA: 'ATHLETE',
  NINO: 'CHILD',
  ADOLESCENTE: 'ADOLESCENT',
  OBESIDAD: 'OBESITY',
  ADULTO_MAYOR: 'OLDER_ADULT',
};

const LEVEL_CODES: Readonly<Record<string, EvaluationLevel>> = {
  BASICO: 'BASIC',
  ISAK1: 'ISAK1',
  ISAK2: 'ISAK2',
};

const SIDE_CODES: Readonly<Record<string, MeasurementSide>> = {
  DERECHO: 'RIGHT',
  IZQUIERDO: 'LEFT',
};

const DOCUMENT_TYPES: readonly DocumentType[] = ['DNI', 'CE', 'PASAPORTE', 'OTRO'];

export interface PatientRow {
  readonly row: number;
  readonly externalId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly sex: Sex;
  readonly birthDate: string;
  readonly document: { readonly type: DocumentType; readonly number: string } | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly population: Population;
  readonly active: boolean;
  readonly healthDataConsentDate: string | null;
}

export interface EvaluationRow {
  readonly row: number;
  readonly externalId: string;
  readonly patientExternalId: string;
  readonly localDate: string;
  /** Minutos desde la medianoche en la zona de la organización; sin hora, las 09:00. */
  readonly minutesOfDay: number;
  readonly level: EvaluationLevel;
  readonly fasting: boolean;
  readonly intenseActivityLast24h: boolean;
}

export interface MeasurementRow {
  readonly row: number;
  readonly evaluationExternalId: string;
  readonly siteCode: string;
  readonly attempts: readonly number[];
  readonly side: MeasurementSide;
}

export interface PlanRow {
  readonly row: number;
  readonly externalId: string;
  readonly patientExternalId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly targetKcal: number | null;
  readonly targetProteinG: number | null;
  readonly targetFatG: number | null;
  readonly targetChoG: number | null;
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

export type Cells = Readonly<Record<string, string>>;
export type RowResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly messages: readonly string[];
    };

/** Sin hora en la plantilla, la evaluación queda a las 09:00 de su día. */
export const DEFAULT_MINUTES_OF_DAY = 9 * 60;

const EXTERNAL_ID = /^[A-Za-z0-9._-]{1,64}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2}))?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Junta los mensajes de las columnas de una fila: si hay alguno, la fila no entra. */
class Messages {
  readonly list: string[] = [];
  add(column: string, message: string): void {
    this.list.push(`${column}: ${message}`);
  }
}

const isValidDate = (value: string): boolean => {
  const match = DATE.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function externalId(messages: Messages, column: string, value: string): string {
  if (!EXTERNAL_ID.test(value)) {
    messages.add(column, 'de 1 a 64 letras sin tildes, números, punto, guion o guion bajo.');
  }
  return value;
}

function text(messages: Messages, column: string, value: string, max: number): string {
  if (value === '') messages.add(column, 'es obligatorio.');
  else if (value.length > max) messages.add(column, `hasta ${String(max)} caracteres.`);
  return value;
}

function optionalText(
  messages: Messages,
  column: string,
  value: string,
  max: number,
): string | null {
  if (value === '') return null;
  if (value.length > max) messages.add(column, `hasta ${String(max)} caracteres.`);
  return value;
}

function date(messages: Messages, column: string, value: string, today: string): string {
  if (!isValidDate(value)) messages.add(column, 'una fecha AAAA-MM-DD.');
  else if (value > today) messages.add(column, 'no puede ser posterior a hoy.');
  return value;
}

function optionalDate(
  messages: Messages,
  column: string,
  value: string,
  today: string,
): string | null {
  return value === '' ? null : date(messages, column, value, today);
}

function yesNo(messages: Messages, column: string, value: string, empty: boolean): boolean {
  if (value === '') return empty;
  if (value === 'SI') return true;
  if (value === 'NO') return false;
  messages.add(column, 'SI o NO.');
  return empty;
}

function decimal(
  messages: Messages,
  column: string,
  value: string,
  range: { readonly min: number; readonly max: number; readonly integer?: boolean },
): number | null {
  if (value === '') return null;
  if (value.includes(',')) {
    messages.add(column, 'el decimal va con punto, sin separador de miles (72.5).');
    return null;
  }
  if (!DECIMAL.test(value)) {
    messages.add(column, 'un número.');
    return null;
  }
  const number = Number(value);
  if (range.integer && !Number.isInteger(number)) {
    messages.add(column, 'un número entero.');
    return null;
  }
  if (number < range.min || number > range.max) {
    messages.add(column, `entre ${String(range.min)} y ${String(range.max)}.`);
    return null;
  }
  return number;
}

function result<T>(messages: Messages, value: T): RowResult<T> {
  return messages.list.length > 0 ? { ok: false, messages: messages.list } : { ok: true, value };
}

/** Una fila de pacientes.csv. `today`: AAAA-MM-DD en la zona de la organización. */
export function parsePatientRow(row: number, cells: Cells, today: string): RowResult<PatientRow> {
  const m = new Messages();
  const id = externalId(m, 'id_origen', cells.id_origen ?? '');
  const firstName = text(m, 'nombres', cells.nombres ?? '', 80);
  const lastName = text(m, 'apellidos', cells.apellidos ?? '', 80);
  const sexCell = cells.sexo ?? '';
  if (sexCell !== 'F' && sexCell !== 'M') m.add('sexo', 'F o M.');
  const birthDate = date(m, 'fecha_nacimiento', cells.fecha_nacimiento ?? '', today);

  const documentType = cells.tipo_documento ?? '';
  const documentNumber = cells.numero_documento ?? '';
  let document: PatientRow['document'] = null;
  if (documentType === '' && documentNumber !== '') {
    m.add('tipo_documento', 'falta el tipo del documento.');
  } else if (documentType !== '' && documentNumber === '') {
    m.add('numero_documento', 'falta el número del documento.');
  } else if (documentType !== '') {
    if (!DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      m.add('tipo_documento', 'DNI, CE, PASAPORTE u OTRO.');
    } else if (documentNumber.length > 20) {
      m.add('numero_documento', 'hasta 20 caracteres.');
    } else {
      document = { type: documentType as DocumentType, number: documentNumber };
    }
    if (documentNumber !== '' && documentNumber === id) {
      m.add('id_origen', 'no puede ser el número de documento: usa el id del sistema anterior.');
    }
  }

  const phone = optionalText(m, 'telefono', cells.telefono ?? '', 30);
  const email = optionalText(m, 'correo', cells.correo ?? '', 254);
  if (email !== null && !EMAIL.test(email)) m.add('correo', 'un correo válido.');
  const populationCell = cells.poblacion ?? '';
  const population = populationCell === '' ? 'ADULT' : POPULATION_CODES[populationCell];
  if (!population) {
    m.add('poblacion', `${Object.keys(POPULATION_CODES).join(', ')} o vacía (ADULTO).`);
  }
  const active = yesNo(m, 'activo', cells.activo ?? '', true);
  const consent = optionalDate(
    m,
    'consentimiento_datos_salud',
    cells.consentimiento_datos_salud ?? '',
    today,
  );
  if (consent !== null && isValidDate(birthDate) && consent < birthDate) {
    m.add('consentimiento_datos_salud', 'no puede ser anterior a la fecha de nacimiento.');
  }
  if (population === 'OBESITY' && consent === null) {
    m.add(
      'poblacion',
      'OBESIDAD es un dato de salud: necesita la fecha del consentimiento (RN-B01).',
    );
  }
  return result(m, {
    row,
    externalId: id,
    firstName,
    lastName,
    sex: sexCell as Sex,
    birthDate,
    document,
    phone,
    email,
    population: population ?? 'ADULT',
    active,
    healthDataConsentDate: consent,
  });
}

/** Una fila de evaluaciones.csv. */
export function parseEvaluationRow(
  row: number,
  cells: Cells,
  today: string,
): RowResult<EvaluationRow> {
  const m = new Messages();
  const id = externalId(m, 'id_origen', cells.id_origen ?? '');
  const patient = externalId(m, 'id_paciente', cells.id_paciente ?? '');
  const match = DATE_TIME.exec(cells.fecha ?? '');
  let localDate = '';
  let minutesOfDay = DEFAULT_MINUTES_OF_DAY;
  if (!match?.[1] || !isValidDate(match[1])) {
    m.add('fecha', 'una fecha AAAA-MM-DD, con la hora HH:MM opcional (2025-03-14 08:30).');
  } else {
    localDate = date(m, 'fecha', match[1], today);
    if (match[2] !== undefined && match[3] !== undefined) {
      const hours = Number(match[2]);
      const minutes = Number(match[3]);
      if (hours > 23 || minutes > 59) m.add('fecha', 'la hora va de 00:00 a 23:59.');
      else minutesOfDay = hours * 60 + minutes;
    }
  }
  const level = LEVEL_CODES[cells.nivel ?? ''];
  if (!level) m.add('nivel', 'BASICO, ISAK1 o ISAK2.');
  const fasting = yesNo(m, 'en_ayunas', cells.en_ayunas ?? '', false);
  const intense = yesNo(m, 'actividad_intensa_24h', cells.actividad_intensa_24h ?? '', false);
  return result(m, {
    row,
    externalId: id,
    patientExternalId: patient,
    localDate,
    minutesOfDay,
    level: level ?? 'BASIC',
    fasting,
    intenseActivityLast24h: intense,
  });
}

/**
 * Una fila de tomas.csv: el sitio va con el código del catálogo de NutriCoach y dos tomas, o tres si las dos primeras difieren más que
 * su tolerancia (RN-C02 a RN-C04). El rango y la tercera los valida la evaluación.
 */
export function parseMeasurementRow(row: number, cells: Cells): RowResult<MeasurementRow> {
  const m = new Messages();
  const evaluation = externalId(m, 'id_evaluacion', cells.id_evaluacion ?? '');
  const site = cells.sitio ?? '';
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(site))
    m.add('sitio', 'el código del sitio, como SKF_TRICEPS.');
  const attempts: number[] = [];
  const first = decimal(m, 'toma_1', cells.toma_1 ?? '', { min: 0, max: 1000 });
  if ((cells.toma_1 ?? '') === '') m.add('toma_1', 'es obligatoria.');
  const second = decimal(m, 'toma_2', cells.toma_2 ?? '', { min: 0, max: 1000 });
  // Como en la app: un sitio se consolida con dos tomas, y con la tercera si difieren de más (RN-C02).
  if ((cells.toma_2 ?? '') === '')
    m.add('toma_2', 'es obligatoria: cada sitio va con dos tomas (RN-C02).');
  const third = decimal(m, 'toma_3', cells.toma_3 ?? '', { min: 0, max: 1000 });
  if (third !== null && second === null) m.add('toma_3', 'va solo si hay toma_2.');
  for (const value of [first, second, third]) if (value !== null) attempts.push(value);
  const sideCell = cells.lado ?? '';
  const side = sideCell === '' ? 'RIGHT' : SIDE_CODES[sideCell];
  if (!side) m.add('lado', 'DERECHO, IZQUIERDO o vacío (DERECHO).');
  return result(m, {
    row,
    evaluationExternalId: evaluation,
    siteCode: site,
    attempts,
    side: side ?? 'RIGHT',
  });
}

/** Una fila de planes.csv: el historial del plan, con al menos una meta o las indicaciones. */
export function parsePlanRow(row: number, cells: Cells, today: string): RowResult<PlanRow> {
  const m = new Messages();
  const id = externalId(m, 'id_origen', cells.id_origen ?? '');
  const patient = externalId(m, 'id_paciente', cells.id_paciente ?? '');
  const validFrom = date(m, 'desde', cells.desde ?? '', today);
  const validTo = cells.hasta ? (isValidDate(cells.hasta) ? cells.hasta : null) : null;
  if (cells.hasta && !isValidDate(cells.hasta)) m.add('hasta', 'una fecha AAAA-MM-DD.');
  if (validTo !== null && isValidDate(validFrom) && validTo < validFrom) {
    m.add('hasta', 'no puede ser anterior a desde.');
  }
  const targetKcal = decimal(m, 'kcal', cells.kcal ?? '', { min: 1, max: 15000 });
  const targetProteinG = decimal(m, 'proteina_g', cells.proteina_g ?? '', { min: 0, max: 1000 });
  const targetFatG = decimal(m, 'grasa_g', cells.grasa_g ?? '', { min: 0, max: 1000 });
  const targetChoG = decimal(m, 'carbohidratos_g', cells.carbohidratos_g ?? '', {
    min: 0,
    max: 2000,
  });
  const hydrationTargetMl = decimal(m, 'agua_ml', cells.agua_ml ?? '', {
    min: 1,
    max: 20000,
    integer: true,
  });
  const instructions = optionalText(m, 'indicaciones', cells.indicaciones ?? '', 4000);
  const values = [targetKcal, targetProteinG, targetFatG, targetChoG, hydrationTargetMl];
  if (values.every((v) => v === null) && instructions === null && m.list.length === 0) {
    m.add('kcal', 'el plan necesita al menos una meta o sus indicaciones.');
  }
  return result(m, {
    row,
    externalId: id,
    patientExternalId: patient,
    validFrom,
    validTo,
    targetKcal,
    targetProteinG,
    targetFatG,
    targetChoG,
    hydrationTargetMl,
    instructions,
  });
}
