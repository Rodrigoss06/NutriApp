import type { MovementPattern, TrainingLevel } from '@nutricoach/engine';
import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

export const MOVEMENT_PATTERN_CODES: readonly MovementPattern[] = [
  'SQUAT',
  'HINGE',
  'HIP_EXTENSION',
  'UNILATERAL',
  'HORIZONTAL_PUSH',
  'VERTICAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PULL',
  'SHOULDER',
  'BICEPS',
  'TRICEPS',
  'CORE_ANTI_EXTENSION',
  'CORE_ANTI_ROTATION',
  'CALF',
  'CONDITIONING',
];

export const TRAINING_LEVEL_CODES: readonly TrainingLevel[] = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
];

export type ExerciseModality = 'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'PLYOMETRIC';
const MODALITIES: readonly ExerciseModality[] = ['STRENGTH', 'CARDIO', 'MOBILITY', 'PLYOMETRIC'];

/** Qué cuentan los valores base: la V3 pone 20 en la caminata y son minutos (ADR-071). */
export type BaseMeasure = 'REPS' | 'SECONDS' | 'MINUTES';
const MEASURES: readonly BaseMeasure[] = ['REPS', 'SECONDS', 'MINUTES'];

export type ExerciseStatus = 'ACTIVE' | 'ARCHIVED';

/** Solo para el perfil de entrenamiento (07 §2): ningún ejercicio lo lleva. */
export const FULL_GYM = 'FULL_GYM';

/** La ficha de un ejercicio (07 §5), sin lo que depende de dónde se guarde. */
export interface ExerciseCard {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly pattern: MovementPattern;
  readonly level: TrainingLevel;
  readonly modality: ExerciseModality;
  readonly equipmentCode: string | null;
  readonly isUnilateral: boolean;
  /** Cuentan 1 en el conteo de series (RN-F06). */
  readonly primaryMuscles: readonly string[];
  /** Cuentan 0.5 (RN-F06). */
  readonly secondaryMuscles: readonly string[];
  readonly caution: string | null;
  readonly baseSets: number | null;
  readonly baseRepsMin: number | null;
  readonly baseRepsMax: number | null;
  readonly baseMeasure: BaseMeasure;
  readonly baseRestSeconds: number | null;
}

/** Un ejercicio base de seeds/exercise/ejercicios-base.csv: sus variantes van por código (RF-38). */
export interface LibraryExercise extends ExerciseCard {
  readonly code: string;
  readonly alternativeCode: string | null;
  readonly easierCode: string | null;
  readonly harderCode: string | null;
  readonly provisional: boolean;
}

/** Encabezado de seeds/exercise/ejercicios-base.csv. */
export const LIBRARY_COLUMNS = [
  'codigo',
  'patron',
  'nombre',
  'alias',
  'modalidad',
  'nivel',
  'equipo',
  'unilateral',
  'principal',
  'secundarios',
  'precaucion',
  'alternativa',
  'regresion',
  'progresion',
  'series',
  'reps_min',
  'reps_max',
  'medida',
  'descanso_s',
  'provisional',
] as const;

const CODE = /^[A-Z]{2}\d{2}$/;
const MUSCLE = /^[A-Z_]+$/;
const list = (text: string | undefined): string[] =>
  (text ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item !== '');

const isOneOf = <T extends string>(options: readonly T[], value: string): value is T =>
  (options as readonly string[]).includes(value);

/**
 * Una fila de seeds/exercise/ejercicios-base.csv (RF-38). Valida lo de la fila; lo que cruza filas (las variantes) lo
 * revisa libraryProblems, y lo que está en la base (músculos y equipos), quien guarda.
 */
export function parseLibraryRow(
  record: Readonly<Record<string, string>>,
): Result<LibraryExercise, string[]> {
  const errors: string[] = [];
  const code = record.codigo ?? '';
  if (!CODE.test(code)) errors.push(`codigo: «${code}» no tiene la forma SQ01`);
  const pattern = record.patron ?? '';
  if (!isOneOf(MOVEMENT_PATTERN_CODES, pattern)) errors.push(`patron: «${pattern}» no existe`);
  const name = (record.nombre ?? '').trim();
  if (name.length < 2) errors.push('nombre: vacío');
  const modality = record.modalidad ?? '';
  if (!isOneOf(MODALITIES, modality)) errors.push(`modalidad: «${modality}» no existe`);
  const level = record.nivel ?? '';
  if (!isOneOf(TRAINING_LEVEL_CODES, level)) errors.push(`nivel: «${level}» no existe`);
  const measure = record.medida ?? '';
  if (!isOneOf(MEASURES, measure)) errors.push(`medida: «${measure}» no existe`);
  const yesNo = (column: string): boolean => {
    const value = record[column];
    if (value !== 'si' && value !== 'no') errors.push(`${column}: «${value ?? ''}» no es si o no`);
    return value === 'si';
  };
  const isUnilateral = yesNo('unilateral');
  const provisional = yesNo('provisional');
  const primary = (record.principal ?? '').trim();
  if (!MUSCLE.test(primary)) errors.push(`principal: «${primary}» no es un código de músculo`);
  const secondary = list(record.secundarios);
  if (secondary.includes(primary)) errors.push(`secundarios: ${primary} ya es el principal`);
  const whole = (column: string, min: number, max: number): number => {
    const text = (record[column] ?? '').trim();
    const value = Number(text);
    if (text === '' || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${column}: «${text}» no es un entero de ${min} a ${max}`);
    }
    return value;
  };
  const baseSets = whole('series', 1, 10);
  const baseRepsMin = whole('reps_min', 1, 600);
  const baseRepsMax = whole('reps_max', 1, 600);
  if (baseRepsMin > baseRepsMax) errors.push('reps_min: mayor que reps_max');
  const baseRestSeconds = whole('descanso_s', 0, 600);

  if (errors.length > 0) return err(errors);
  return ok({
    code,
    name,
    aliases: list(record.alias),
    pattern: pattern as MovementPattern,
    level: level as TrainingLevel,
    modality: modality as ExerciseModality,
    equipmentCode: record.equipo === '' || record.equipo === undefined ? null : record.equipo,
    isUnilateral,
    primaryMuscles: [primary],
    secondaryMuscles: secondary,
    caution: (record.precaucion ?? '').trim() || null,
    alternativeCode: record.alternativa || null,
    easierCode: record.regresion || null,
    harderCode: record.progresion || null,
    baseSets,
    baseRepsMin,
    baseRepsMax,
    baseMeasure: measure as BaseMeasure,
    baseRestSeconds,
    provisional,
  });
}

const LEVEL_RANK: Readonly<Record<TrainingLevel, number>> = {
  BEGINNER: 0,
  INTERMEDIATE: 1,
  ADVANCED: 2,
};

/**
 * Lo que cruza filas del archivo: cada variante existe, no es el mismo ejercicio, y una regresión no pide más nivel ni
 * una progresión, menos (RN-F11). Un archivo con problemas no se guarda.
 */
export function libraryProblems(rows: readonly LibraryExercise[]): readonly string[] {
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const problems: string[] = [];
  for (const row of rows) {
    const references = [
      ['alternativa', row.alternativeCode],
      ['regresion', row.easierCode],
      ['progresion', row.harderCode],
    ] as const;
    for (const [column, code] of references) {
      if (code === null) continue;
      if (code === row.code) problems.push(`${row.code}: ${column} es el mismo ejercicio`);
      else if (!byCode.has(code)) problems.push(`${row.code}: ${column} ${code} no existe`);
    }
    const easier = row.easierCode ? byCode.get(row.easierCode) : undefined;
    if (easier && LEVEL_RANK[easier.level] > LEVEL_RANK[row.level]) {
      problems.push(`${row.code}: la regresión ${easier.code} pide más nivel`);
    }
    const harder = row.harderCode ? byCode.get(row.harderCode) : undefined;
    if (harder && LEVEL_RANK[harder.level] < LEVEL_RANK[row.level]) {
      problems.push(`${row.code}: la progresión ${harder.code} pide menos nivel`);
    }
  }
  return problems;
}

/** Una fila de seeds/exercise/pattern-choice-v3.csv: el ejercicio sugerido por patrón y nivel (07 §5). */
export interface PatternChoiceRow {
  readonly pattern: MovementPattern;
  readonly level: TrainingLevel;
  readonly exerciseCode: string;
  readonly exerciseName: string;
}

export const PATTERN_CHOICE_COLUMNS = ['patron', 'nivel', 'codigo_ejercicio', 'ejercicio'] as const;

export function parsePatternChoiceRow(
  record: Readonly<Record<string, string>>,
): Result<PatternChoiceRow, string[]> {
  const errors: string[] = [];
  const pattern = record.patron ?? '';
  if (!isOneOf(MOVEMENT_PATTERN_CODES, pattern)) errors.push(`patron: «${pattern}» no existe`);
  const level = record.nivel ?? '';
  if (!isOneOf(TRAINING_LEVEL_CODES, level)) errors.push(`nivel: «${level}» no existe`);
  const exerciseCode = record.codigo_ejercicio ?? '';
  if (!CODE.test(exerciseCode)) {
    errors.push(`codigo_ejercicio: «${exerciseCode}» no tiene la forma SQ01`);
  }
  const exerciseName = (record.ejercicio ?? '').trim();
  if (exerciseName === '') errors.push('ejercicio: vacío');
  if (errors.length > 0) return err(errors);
  return ok({
    pattern: pattern as MovementPattern,
    level: level as TrainingLevel,
    exerciseCode,
    exerciseName,
  });
}

/** Un ejercicio propio inválido: varias cosas a la vez, cada una en details.problems. */
export const INVALID_OWN_EXERCISE = 'NC-EXE-001';

/** Lo que manda quien crea o edita un ejercicio propio, ya validado en su forma por el contrato. */
export interface OwnExerciseInput extends ExerciseCard {
  readonly alternativeId: string | null;
  readonly easierVariantId: string | null;
  readonly harderVariantId: string | null;
  readonly mediaUrl: string | null;
  readonly instructions: string | null;
}

/** Los catálogos y las variantes que la base conoce, para validar un ejercicio propio. */
export interface OwnExerciseReferences {
  readonly muscleCodes: ReadonlySet<string>;
  readonly equipmentCodes: ReadonlySet<string>;
  /** Las variantes que la organización ve, activas o no. */
  readonly visibleExerciseIds: ReadonlySet<string>;
  /** El ejercicio que se edita; null al crearlo. */
  readonly selfId: string | null;
}

/**
 * Un ejercicio propio de la organización (RF-25, RN-I01): un músculo principal como mínimo y ninguno en las dos listas
 * (cuentan distinto, RN-F06), repeticiones en orden, y catálogos y variantes que existen para ella.
 */
export function ownExerciseProblems(
  input: OwnExerciseInput,
  references: OwnExerciseReferences,
): Result<OwnExerciseInput, DomainError> {
  const problems: string[] = [];
  if (input.primaryMuscles.length === 0) problems.push('Elige al menos un músculo principal.');
  const seen = new Set<string>();
  for (const muscle of [...input.primaryMuscles, ...input.secondaryMuscles]) {
    if (!references.muscleCodes.has(muscle)) problems.push(`${muscle} no es un grupo muscular.`);
    if (seen.has(muscle)) problems.push(`${muscle} está dos veces: va en una sola lista.`);
    seen.add(muscle);
  }
  const { equipmentCode } = input;
  if (equipmentCode !== null && !references.equipmentCodes.has(equipmentCode)) {
    problems.push(`${equipmentCode} no es un equipo.`);
  }
  if (equipmentCode === FULL_GYM) problems.push('Elige el equipo que usa el ejercicio.');
  if (
    input.baseRepsMin !== null &&
    input.baseRepsMax !== null &&
    input.baseRepsMin > input.baseRepsMax
  ) {
    problems.push('Las repeticiones mínimas son más que las máximas.');
  }
  const variants = [
    ['La alternativa', input.alternativeId],
    ['La regresión', input.easierVariantId],
    ['La progresión', input.harderVariantId],
  ] as const;
  for (const [label, id] of variants) {
    if (id === null) continue;
    if (id === references.selfId) problems.push(`${label} no puede ser el mismo ejercicio.`);
    else if (!references.visibleExerciseIds.has(id)) problems.push(`${label} no existe.`);
  }
  if (problems.length > 0) {
    return err(
      domainError({
        code: INVALID_OWN_EXERCISE,
        rule: 'RN-F11',
        message: 'Revisa los datos del ejercicio.',
        details: { problems },
      }),
    );
  }
  return ok(input);
}
