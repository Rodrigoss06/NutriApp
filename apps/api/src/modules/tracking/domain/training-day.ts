import { sessionsOn } from './active-program.js';

/**
 * El entreno del paciente desde el snapshot del programa publicado (RN-F12): la sesión del día como la ve, su tonelaje planificado
 * y los músculos que se congelan en cada serie registrada (RN-F06). Puro: el snapshot llega como datos.
 */

type LoadKind = 'KG' | 'PCT_1RM' | 'RPE' | 'RIR' | 'BODYWEIGHT';
type SetType = 'WARMUP' | 'WORKING' | 'DROP' | 'AMRAP' | 'BACKOFF';

export interface SnapshotSet {
  readonly setNo: number;
  readonly setType: SetType;
  readonly repsMin: number | null;
  readonly repsMax: number | null;
  readonly loadKind: LoadKind | null;
  readonly loadValue: number | null;
  readonly restSeconds: number | null;
  readonly tempo: string | null;
  readonly durationSeconds: number | null;
  readonly distanceM: number | null;
  readonly met: number | null;
}

interface Named {
  readonly name: string;
}

export interface SnapshotExercise {
  readonly id: string;
  readonly exerciseId: string;
  readonly position: number;
  readonly name: string;
  readonly supersetGroup: string | null;
  readonly notes: string | null;
  readonly caution: string | null;
  readonly alternative: Named | null;
  readonly easierVariant: Named | null;
  readonly harderVariant: Named | null;
  readonly mediaUrl: string | null;
  readonly instructions: string | null;
  readonly primaryMuscles: readonly { readonly code: string; readonly name: string }[];
  readonly secondaryMuscles: readonly { readonly code: string; readonly name: string }[];
  readonly sets: readonly SnapshotSet[];
}

/** Una sesión del snapshot: estructural, como lo congela training (02 §4). */
export interface SnapshotSession {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly dayOfWeek: number | null;
  readonly notes: string | null;
  readonly exercises: readonly SnapshotExercise[];
}

export interface SessionExerciseView {
  readonly id: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly supersetGroup: string | null;
  readonly notes: string | null;
  readonly caution: string | null;
  readonly alternative: string | null;
  readonly easierVariant: string | null;
  readonly harderVariant: string | null;
  readonly mediaUrl: string | null;
  readonly instructions: string | null;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly sets: readonly SnapshotSet[];
}

export interface SessionView {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly dayOfWeek: number | null;
  readonly notes: string | null;
  readonly exercises: readonly SessionExerciseView[];
  /** kg × repeticiones de las series efectivas, si todas lo dicen; null si no (P-09, ADR-080). */
  readonly plannedTonnageKg: number | null;
}

/**
 * Lo que la sesión muestra al paciente: sus notas y las de cada ejercicio, que el coach escribe para él, con su precaución, su
 * alternativa y sus variantes (RN-F11). La nota de la sustitución y quién aprobó son de la aprobación y no van (07, P-18; ADR-079).
 */
export function sessionView(session: SnapshotSession): SessionView {
  return {
    id: session.id,
    position: session.position,
    name: session.name,
    dayOfWeek: session.dayOfWeek,
    notes: session.notes,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      supersetGroup: exercise.supersetGroup,
      notes: exercise.notes,
      caution: exercise.caution,
      alternative: exercise.alternative?.name ?? null,
      easierVariant: exercise.easierVariant?.name ?? null,
      harderVariant: exercise.harderVariant?.name ?? null,
      mediaUrl: exercise.mediaUrl,
      instructions: exercise.instructions,
      primaryMuscles: exercise.primaryMuscles.map(({ name }) => name),
      secondaryMuscles: exercise.secondaryMuscles.map(({ name }) => name),
      sets: exercise.sets,
    })),
    plannedTonnageKg: plannedTonnageKg(session),
  };
}

/**
 * El rendimiento planificado de la sesión (P-09): el tonelaje prescrito, RN-F03 sin calentamiento. Solo si cada serie efectiva
 * tiene kg y repeticiones fijas; con RIR, RPE, % de 1RM o un rango no hay un número planificado que comparar (ADR-080).
 */
export function plannedTonnageKg(session: SnapshotSession): number | null {
  let total = 0;
  let counted = 0;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.setType === 'WARMUP') continue;
      if (set.loadKind !== 'KG' || set.loadValue === null) return null;
      if (set.repsMin === null || set.repsMax === null || set.repsMin !== set.repsMax) return null;
      total += set.loadValue * set.repsMin;
      counted += 1;
    }
  }
  return counted === 0 ? null : total;
}

/** Los músculos de un ejercicio con su peso en las series semanales (RN-F06): principal 1, secundario 0.5. */
export function musclesOf(
  exercise: Pick<SnapshotExercise, 'primaryMuscles' | 'secondaryMuscles'>,
): readonly { readonly muscle: string; readonly weight: number }[] {
  return [
    ...exercise.primaryMuscles.map(({ code }) => ({ muscle: code, weight: 1 })),
    ...exercise.secondaryMuscles.map(({ code }) => ({ muscle: code, weight: 0.5 })),
  ];
}

/** Una semana del snapshot con lo que dice su fase (RN-F13). */
export interface SnapshotWeek {
  readonly id: string;
  readonly weekNo: number;
  readonly isDeload: boolean;
  readonly phaseEs: string | null;
  readonly targetRir: number | null;
  readonly sessions: readonly SnapshotSession[];
}

/** Lo que el entreno del paciente lee del snapshot del programa publicado (RN-F12). */
export interface SnapshotProgram {
  readonly programId: string;
  readonly name: string;
  /** YYYY-MM-DD: el primer día del programa. */
  readonly startDate: string;
  readonly mesocycles: readonly {
    readonly id: string;
    readonly weeks: readonly SnapshotWeek[];
  }[];
}

export interface ProgramPlace {
  readonly mesocycleId: string;
  readonly week: SnapshotWeek;
}

/** La semana y el mesociclo de una sesión del programa: se registra en su semana aunque se haga otro día (07 §8). */
export function locateSession(
  program: SnapshotProgram,
  sessionId: string,
): (ProgramPlace & { readonly session: SnapshotSession }) | null {
  for (const mesocycle of program.mesocycles) {
    for (const week of mesocycle.weeks) {
      const session = week.sessions.find(({ id }) => id === sessionId);
      if (session) return { mesocycleId: mesocycle.id, week, session };
    }
  }
  return null;
}

export type ProgramDay = ProgramPlace & { readonly sessions: readonly SnapshotSession[] };

/** El día del programa (07 §8): su semana, su mesociclo y sus sesiones; ninguna en un descanso. Fuera del programa, null. */
export function programDayOn(program: SnapshotProgram, localDate: string): ProgramDay | null {
  const weeks = program.mesocycles.flatMap((mesocycle) =>
    mesocycle.weeks.map((week) => ({ ...week, mesocycleId: mesocycle.id, week })),
  );
  const day = sessionsOn({ startDate: program.startDate, weeks }, localDate);
  if (!day) return null;
  const place = weeks.find(({ weekNo }) => weekNo === day.weekNo);
  return place
    ? { mesocycleId: place.mesocycleId, week: place.week, sessions: day.sessions }
    : null;
}

export interface LoggableSet {
  readonly exerciseName: string;
  readonly muscleContributions: readonly { readonly muscle: string; readonly weight: number }[];
}

/**
 * Las series registradas con el nombre de su ejercicio y sus músculos congelados (RN-F06), si todos sus ejercicios están en esas
 * sesiones del programa; si alguno no está, null (RF-29).
 */
export function loggableSets<TSet extends { readonly exerciseId: string }>(
  sessions: readonly Pick<SnapshotSession, 'exercises'>[],
  sets: readonly TSet[],
): (TSet & LoggableSet)[] | null {
  const byId = new Map(
    sessions.flatMap(({ exercises }) =>
      exercises.map((exercise) => [exercise.exerciseId, exercise]),
    ),
  );
  const drafts: (TSet & LoggableSet)[] = [];
  for (const set of sets) {
    const exercise = byId.get(set.exerciseId);
    if (!exercise) return null;
    drafts.push({ ...set, exerciseName: exercise.name, muscleContributions: musclesOf(exercise) });
  }
  return drafts;
}

export interface DayPerformance {
  readonly planned: number | null;
  readonly actual: number | null;
  /** De dónde salió: del entreno registrado, de lo que escribió el paciente o de ninguno. */
  readonly source: 'WORKOUT' | 'PATIENT' | null;
}

/**
 * El rendimiento del día (P-09, ADR-080): el tonelaje prescrito frente al registrado si existen los dos; si no, lo que escribió el
 * paciente. Las dos fuentes no se mezclan, porque pueden estar en unidades distintas.
 */
export function dayPerformance(
  workout: { readonly plannedTonnageKg: number | null; readonly loggedTonnageKg: number | null },
  written: { readonly planned: number | null; readonly actual: number | null },
): DayPerformance {
  if (workout.plannedTonnageKg !== null && workout.loggedTonnageKg !== null) {
    return {
      planned: workout.plannedTonnageKg,
      actual: workout.loggedTonnageKg,
      source: 'WORKOUT',
    };
  }
  if (written.planned === null && written.actual === null) {
    return { planned: null, actual: null, source: null };
  }
  return { planned: written.planned, actual: written.actual, source: 'PATIENT' };
}
