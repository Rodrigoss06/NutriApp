import {
  canonicalJson,
  ENGINE_VERSION,
  FRACTIONAL_SETS,
  runMethod,
  sha256Hex,
  type MuscleRole,
} from '@nutricoach/engine';
import type { ExerciseRecord, MuscleRef } from '../../exercise/index.js';
import {
  weeksOf,
  type Mesocycle,
  type OneRmFormula,
  type PrescribedExercise,
  type PrescribedSet,
  type ProgramOrigin,
  type ProgramPrescription,
  type ProgramSession,
  type ProgramWeekPhase,
} from '../domain/program.js';

export interface ProgramDocumentExercise extends Omit<PrescribedExercise, 'approvedAt' | 'sets'> {
  readonly name: string;
  readonly pattern: ExerciseRecord['pattern'];
  readonly approvedAt: string | null;
  readonly primaryMuscles: readonly MuscleRef[];
  readonly secondaryMuscles: readonly MuscleRef[];
  readonly caution: string | null;
  readonly alternative: ExerciseRecord['alternative'];
  readonly easierVariant: ExerciseRecord['easierVariant'];
  readonly harderVariant: ExerciseRecord['harderVariant'];
  readonly mediaUrl: string | null;
  readonly instructions: string | null;
  readonly sets: readonly PrescribedSet[];
}

export interface ProgramDocumentSession extends Omit<ProgramSession, 'exercises'> {
  /** Series efectivas por grupo muscular, con conteo fraccional (RN-F06). */
  readonly setsByMuscle: Readonly<Record<string, number>>;
  readonly exercises: readonly ProgramDocumentExercise[];
}

export interface ProgramDocumentWeek extends ProgramWeekPhase {
  readonly id: string;
  readonly weekNo: number;
  readonly sessions: readonly ProgramDocumentSession[];
}

/** Lo que muestran la pantalla y la ficha, y lo que congela publicar (RN-F12). */
export interface ProgramDocument {
  readonly totalWeeks: number;
  /** El método de las series por grupo muscular (RN-D01). */
  readonly setsMethod: { readonly code: string; readonly version: string };
  readonly mesocycles: readonly {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly focus: string | null;
    readonly weeks: readonly ProgramDocumentWeek[];
  }[];
}

const muscleRoles = (exercise: ExerciseRecord): readonly MuscleRole[] => [
  ...exercise.primaryMuscles.map(({ code }) => ({ muscle: code, role: 'PRIMARY' as const })),
  ...exercise.secondaryMuscles.map(({ code }) => ({ muscle: code, role: 'SECONDARY' as const })),
];

/** El programa con cada ejercicio de la biblioteca y sus series por músculo, según el motor (RN-F06). */
export function programDocument(
  mesocycles: readonly Mesocycle[],
  exercises: readonly ExerciseRecord[],
): ProgramDocument {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const recordOf = (id: string): ExerciseRecord => {
    const record = byId.get(id);
    if (!record) throw new Error(`El ejercicio ${id} de un programa no está en la biblioteca.`);
    return record;
  };
  const muscleMap = Object.fromEntries(
    exercises.map((exercise) => [exercise.id, muscleRoles(exercise)]),
  );
  const documentOf = (session: ProgramSession): ProgramDocumentSession => {
    const run = runMethod(FRACTIONAL_SETS, {
      sets: session.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => ({
          exercise: exercise.exerciseId,
          warmup: set.setType === 'WARMUP',
        })),
      ),
      muscleMap,
    });
    return {
      ...session,
      setsByMuscle: run.ok ? run.result.outputs.setsByMuscle : {},
      exercises: session.exercises.map((exercise) => {
        const record = recordOf(exercise.exerciseId);
        return {
          ...exercise,
          approvedAt: exercise.approvedAt?.toISOString() ?? null,
          name: record.name,
          pattern: record.pattern,
          primaryMuscles: record.primaryMuscles,
          secondaryMuscles: record.secondaryMuscles,
          caution: record.caution,
          alternative: record.alternative,
          easierVariant: record.easierVariant,
          harderVariant: record.harderVariant,
          mediaUrl: record.mediaUrl,
          instructions: record.instructions,
        };
      }),
    };
  };
  return {
    totalWeeks: weeksOf(mesocycles).length,
    setsMethod: { code: FRACTIONAL_SETS.code, version: FRACTIONAL_SETS.version },
    mesocycles: mesocycles.map((mesocycle) => ({
      ...mesocycle,
      weeks: mesocycle.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map(documentOf),
      })),
    })),
  };
}

/** Versión del esquema del snapshot: la app y las fichas la leen antes de leer lo demás (05 §2). */
export const PROGRAM_SNAPSHOT_SCHEMA_VERSION = 1;

export interface ProgramSnapshotMeta extends ProgramPrescription {
  readonly schemaVersion: typeof PROGRAM_SNAPSHOT_SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly programId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly patientId: string;
  readonly name: string;
  readonly goal: string | null;
  readonly origin: ProgramOrigin;
  readonly oneRmFormula: OneRmFormula;
  /** YYYY-MM-DD: el primer día del programa, y el último. */
  readonly startDate: string;
  readonly endDate: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

/** Semana por semana, lo que tracking necesita para la meta de cada día (RN-G03), sin leer el snapshot entero. */
export interface ProgramSchedule {
  readonly weeks: readonly {
    readonly weekNo: number;
    readonly sessions: readonly {
      readonly position: number;
      readonly dayOfWeek: number | null;
      readonly setsByMuscle: Readonly<Record<string, number>>;
    }[];
  }[];
}

/** Lo que congela publicar (RN-F12): con los músculos de cada ejercicio, aunque después se edite la biblioteca. */
export type ProgramSnapshot = ProgramSnapshotMeta &
  ProgramDocument & { readonly schedule: ProgramSchedule };

/** El snapshot y su hash: SHA-256 de su JSON canónico, para verificar que nada cambió (RN-H02). */
export function programSnapshot(
  document: ProgramDocument,
  meta: Omit<ProgramSnapshotMeta, 'schemaVersion' | 'engineVersion'>,
): { readonly snapshot: ProgramSnapshot; readonly hash: string } {
  const snapshot: ProgramSnapshot = {
    schemaVersion: PROGRAM_SNAPSHOT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    ...meta,
    ...document,
    schedule: {
      weeks: document.mesocycles.flatMap((mesocycle) =>
        mesocycle.weeks.map((week) => ({
          weekNo: week.weekNo,
          sessions: week.sessions.map(({ position, dayOfWeek, setsByMuscle }) => ({
            position,
            dayOfWeek,
            setsByMuscle,
          })),
        })),
      ),
    },
  };
  return { snapshot, hash: sha256Hex(canonicalJson(snapshot)) };
}
