import type { MovementPattern, TrainingLevel } from '@nutricoach/engine';
import type {
  BaseMeasure,
  ExerciseModality,
  ExerciseStatus,
  LibraryExercise,
  OwnExerciseInput,
  PatternChoiceRow,
} from '../../domain/exercise-library.js';

export interface ExerciseCatalog {
  readonly patterns: readonly { readonly code: MovementPattern; readonly name: string }[];
  readonly muscles: readonly {
    readonly code: string;
    readonly name: string;
    readonly region: string;
  }[];
  readonly equipment: readonly { readonly code: string; readonly name: string }[];
}

export interface ExerciseSearch {
  readonly text: string | null;
  readonly pattern: MovementPattern | null;
  readonly level: TrainingLevel | null;
  readonly equipmentCode: string | null;
  readonly muscleCode: string | null;
  readonly status: ExerciseStatus;
  readonly limit: number;
}

export interface ExerciseSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly pattern: MovementPattern;
  readonly level: TrainingLevel;
  readonly modality: ExerciseModality;
  readonly equipmentName: string | null;
  readonly primaryMuscles: readonly string[];
  /** Propio de la organización (RN-I01). */
  readonly own: boolean;
  readonly provisional: boolean;
  readonly status: ExerciseStatus;
}

export interface ExerciseRef {
  readonly id: string;
  readonly name: string;
}

export interface MuscleRef {
  readonly code: string;
  readonly name: string;
}

export interface ExerciseRecord extends Omit<ExerciseSummaryRecord, 'primaryMuscles'> {
  readonly code: string | null;
  readonly equipmentCode: string | null;
  readonly isUnilateral: boolean;
  readonly primaryMuscles: readonly MuscleRef[];
  readonly secondaryMuscles: readonly MuscleRef[];
  readonly caution: string | null;
  readonly alternative: ExerciseRef | null;
  readonly easierVariant: ExerciseRef | null;
  readonly harderVariant: ExerciseRef | null;
  readonly baseSets: number | null;
  readonly baseRepsMin: number | null;
  readonly baseRepsMax: number | null;
  readonly baseMeasure: BaseMeasure;
  readonly baseRestSeconds: number | null;
  readonly mediaUrl: string | null;
  readonly instructions: string | null;
  readonly version: number;
}

/** Una fila vigente de la tabla patrón × nivel: la de la organización o, si no puso, la global. */
export interface PatternChoiceRecord {
  readonly pattern: MovementPattern;
  readonly level: TrainingLevel;
  readonly exercise: ExerciseRef;
  readonly own: boolean;
  readonly provisional: boolean;
}

/** Lo que el importador necesita saber de un ejercicio global ya guardado. */
export interface GlobalExerciseRef extends ExerciseRef {
  readonly code: string;
  readonly pattern: MovementPattern;
}

/**
 * exercise.exercise y sus catálogos, con la transacción de quien llama. La RLS deja ver lo global y lo de la
 * organización activa, y escribir solo lo propio; lo global lo escribe el importador, como SYSTEM (RN-I01).
 */
export interface ExerciseStore {
  catalog(): Promise<ExerciseCatalog>;
  search(search: ExerciseSearch): Promise<readonly ExerciseSummaryRecord[]>;
  byIds(ids: readonly string[]): Promise<readonly ExerciseRecord[]>;
  insertOwn(row: {
    readonly id: string;
    readonly organizationId: string;
    readonly createdBy: string;
    readonly exercise: OwnExerciseInput;
  }): Promise<void>;
  /** Con la versión leída; false si alguien la cambió antes. Reemplaza los músculos. */
  updateOwn(id: string, version: number, exercise: OwnExerciseInput): Promise<boolean>;
  setStatus(id: string, version: number, status: ExerciseStatus): Promise<boolean>;

  patternChoices(): Promise<readonly PatternChoiceRecord[]>;
  setPatternChoice(row: {
    readonly id: string;
    readonly organizationId: string;
    readonly pattern: MovementPattern;
    readonly level: TrainingLevel;
    readonly exerciseId: string;
  }): Promise<void>;
  /** Devuelve si había una fila de la organización. */
  clearPatternChoice(
    organizationId: string,
    pattern: MovementPattern,
    level: TrainingLevel,
  ): Promise<boolean>;

  /** Inserta o actualiza por código, con sus músculos y variantes, en la transacción del lote (RN-I04). */
  upsertLibrary(rows: readonly LibraryExercise[]): Promise<void>;
  globalExercises(): Promise<readonly GlobalExerciseRef[]>;
  upsertGlobalChoices(rows: readonly PatternChoiceRow[]): Promise<void>;
}

export const EXERCISE_STORE = Symbol.for('nutricoach.exercise.ExerciseStore');
