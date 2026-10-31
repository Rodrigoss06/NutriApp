import type {
  MovementPattern,
  ReviewKind,
  RoutineSplit,
  TrainingIntensity,
  TrainingLevel,
  TrainingObjective,
} from '@nutricoach/engine';
import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type ProgramStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
export type ProgramOrigin = 'MANUAL' | 'PROPOSAL';
export type OneRmFormula = 'ONERM_EPLEY1985' | 'ONERM_BRZYCKI1993';
export type LoadKind = 'KG' | 'PCT_1RM' | 'RPE' | 'RIR' | 'BODYWEIGHT';
export type SetType = 'WARMUP' | 'WORKING' | 'DROP' | 'AMRAP' | 'BACKOFF';

/** El nombre de una propuesta que no trae el suyo. */
export const PROPOSAL_NAMES: Readonly<Record<TrainingObjective, string>> = {
  FAT_LOSS: 'Macrociclo de pérdida de grasa',
  HYPERTROPHY: 'Macrociclo de hipertrofia',
  STRENGTH: 'Macrociclo de fuerza',
  HEALTH: 'Macrociclo de salud y acondicionamiento',
};

/** La fórmula de quien todavía no tiene programas (RN-F04). */
export const DEFAULT_ONE_RM_FORMULA: OneRmFormula = 'ONERM_EPLEY1985';

export interface PrescribedSet {
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

export interface PrescribedExercise {
  readonly id: string;
  readonly exerciseId: string;
  readonly position: number;
  readonly supersetGroup: string | null;
  readonly notes: string | null;
  /** El patrón del bloque de la propuesta; a mano, null. */
  readonly movementPattern: MovementPattern | null;
  readonly suggestedExerciseId: string | null;
  readonly substitutionNote: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly sets: readonly PrescribedSet[];
}

export interface ProgramSession {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly dayOfWeek: number | null;
  readonly notes: string | null;
  readonly exercises: readonly PrescribedExercise[];
}

/** Lo que dice la tabla de fases de una semana (RN-F13); el coach lo edita. A mano, null. */
export interface ProgramWeekPhase {
  readonly isDeload: boolean;
  readonly phaseEs: string | null;
  readonly phaseGoalEs: string | null;
  readonly volumeFactor: number | null;
  readonly intensity: TrainingIntensity | null;
  readonly targetRir: number | null;
  readonly reviewKind: ReviewKind | null;
}

export interface ProgramWeek extends ProgramWeekPhase {
  readonly id: string;
  /** Sigue en todo el programa: los mesociclos son contiguos (02 §7). */
  readonly weekNo: number;
  readonly sessions: readonly ProgramSession[];
}

export interface Mesocycle {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly focus: string | null;
  readonly weeks: readonly ProgramWeek[];
}

/** Lo que controla la propuesta y el macrociclo (07 §6 y §7); a mano, null. */
export interface ProgramPrescription {
  readonly objective: TrainingObjective | null;
  readonly level: TrainingLevel | null;
  readonly daysPerWeek: number | null;
  readonly split: RoutineSplit | null;
  readonly macrocycleWeeks: number | null;
  readonly periodizationValidFrom: string | null;
  readonly templateVersion: string | null;
  readonly athleteProfileId: string | null;
}

export const PROGRAM_NOT_FOUND = domainError({ code: 'NC-TRA-003', message: 'No encontrado.' });
export const PROGRAM_NOT_DRAFT = domainError({
  code: 'NC-TRA-004',
  rule: 'RN-F12',
  message: 'Este programa ya se publicó: para cambiarlo, crea una versión nueva.',
});
export const PROGRAM_VERSION_CONFLICT = domainError({
  code: 'NC-TRA-005',
  message: 'Alguien cambió este programa mientras lo editabas. Vuelve a cargarlo.',
});
export const ATHLETE_PROFILE_REQUIRED = domainError({
  code: 'NC-TRA-007',
  rule: 'RN-F14',
  message: 'La propuesta sale del perfil de entrenamiento: regístralo primero.',
});
export const WEEK_NOT_FOUND = domainError({ code: 'NC-TRA-010', message: 'No encontrado.' });
export const MESOCYCLE_NOT_FOUND = domainError({ code: 'NC-TRA-011', message: 'No encontrado.' });
export const ONLY_MANUAL_STRUCTURE = domainError({
  code: 'NC-TRA-013',
  message:
    'La propuesta tiene las semanas de su macrociclo: sus mesociclos no se agregan ni se quitan.',
});
export const ONLY_PROPOSAL_APPROVAL = domainError({
  code: 'NC-TRA-014',
  rule: 'RN-F14',
  message: 'Solo una propuesta se aprueba por ejercicio.',
});
export const BLOCK_NOT_FOUND = domainError({ code: 'NC-TRA-015', message: 'No encontrado.' });
export const ONE_RM_FORMULA_FIXED = domainError({
  code: 'NC-TRA-016',
  rule: 'RN-F04',
  message: 'Este paciente ya tiene su fórmula de 1RM: es siempre la misma.',
});
export const PHASE_TABLE_INCOMPLETE = domainError({
  code: 'NC-TRA-019',
  rule: 'RN-F13',
  message: 'La tabla de fases no tiene todas las semanas de este objetivo.',
});

/** La propuesta no se genera ni se publica con una llave cerrada (RN-F15); dice cuál. */
export const proposalBlocked = (status: string): DomainError =>
  domainError({
    code: 'NC-TRA-006',
    rule: 'RN-F15',
    message: 'Una llave de seguridad sigue cerrada: no hay propuesta.',
    details: { status },
  });

export const programNotReady = (problems: readonly string[]): DomainError =>
  domainError({
    code: 'NC-TRA-008',
    rule: 'RN-F12',
    message: 'Todavía no se puede publicar.',
    details: { problems },
  });

export const invalidSessions = (problems: readonly string[]): DomainError =>
  domainError({
    code: 'NC-TRA-009',
    message: 'Revisa las series de esta semana.',
    details: { problems },
  });

/** Una rutina tiene a lo más un borrador a la vez. */
export const programDraftExists = (draftId: string): DomainError =>
  domainError({
    code: 'NC-TRA-012',
    message: 'Esta rutina ya tiene un borrador.',
    details: { draftId },
  });

export const unknownExercises = (ids: readonly string[]): DomainError =>
  domainError({
    code: 'NC-TRA-017',
    message: 'Algún ejercicio no está en la biblioteca.',
    details: { problems: ids.map((id) => `El ejercicio ${id} no está en la biblioteca.`) },
  });

/** La tabla patrón × nivel no tiene ejercicio para algún bloque: sin él no hay propuesta. */
export const patternTableIncomplete = (patterns: readonly string[]): DomainError =>
  domainError({
    code: 'NC-TRA-018',
    rule: 'RN-F14',
    message: 'La tabla de ejercicios por patrón y nivel está incompleta.',
    details: { problems: patterns.map((pattern) => `No hay ejercicio para ${pattern}.`) },
  });

/** Lo que una serie no puede ser (02 §7): repeticiones al revés, media carga, o nada que hacer. */
function setProblems(set: PrescribedSet): readonly string[] {
  const problems: string[] = [];
  const { repsMin, repsMax, loadKind, loadValue, durationSeconds, distanceM, met } = set;
  if (repsMin !== null && repsMax !== null && repsMin > repsMax) {
    problems.push('las repeticiones mínimas son mayores que las máximas');
  }
  if (repsMin === null && repsMax === null && durationSeconds === null && distanceM === null) {
    problems.push('indica repeticiones, duración o distancia');
  }
  if (loadKind === null && loadValue !== null) problems.push('falta la forma de la carga');
  if (loadKind === 'BODYWEIGHT' && loadValue !== null) {
    problems.push('con peso corporal no va un valor de carga');
  }
  if (loadKind !== null && loadKind !== 'BODYWEIGHT' && loadValue === null) {
    problems.push('falta el valor de la carga');
  }
  if (loadValue !== null) {
    if ((loadKind === 'RPE' || loadKind === 'RIR') && loadValue > 10) {
      problems.push(`${loadKind} va de 0 a 10`);
    }
    if (loadKind === 'PCT_1RM' && loadValue > 100) problems.push('el % de 1RM llega hasta 100');
  }
  if (met !== null && durationSeconds === null) problems.push('los MET van con una duración');
  return problems;
}

/** Los problemas de las series de una semana, con dónde está cada uno. */
export function sessionsProblems(sessions: readonly ProgramSession[]): readonly string[] {
  return sessions.flatMap((session) =>
    session.exercises.flatMap((exercise) =>
      exercise.sets.flatMap((set) =>
        setProblems(set).map(
          (problem) =>
            `Sesión ${String(session.position)}, ejercicio ${String(exercise.position)}, serie ${String(set.setNo)}: ${problem}.`,
        ),
      ),
    ),
  );
}

export const weeksOf = (mesocycles: readonly Mesocycle[]): readonly ProgramWeek[] =>
  mesocycles.flatMap((mesocycle) => mesocycle.weeks);

export const exerciseIdsOf = (mesocycles: readonly Mesocycle[]): readonly string[] => [
  ...new Set(
    weeksOf(mesocycles).flatMap((week) =>
      week.sessions.flatMap((session) => session.exercises.map((e) => e.exerciseId)),
    ),
  ),
];

/**
 * Lo que falta para publicar (RN-F12, RN-F14): todas las semanas con sesiones, las sesiones con ejercicios y, en una propuesta,
 * todos sus ejercicios aprobados. Una semana vacía dejaría al paciente sin saber qué hacer; se quita o se llena.
 */
export function programProblems(program: {
  readonly origin: ProgramOrigin;
  readonly mesocycles: readonly Mesocycle[];
}): readonly string[] {
  const weeks = weeksOf(program.mesocycles);
  if (weeks.length === 0) return ['Agrega al menos un mesociclo.'];
  const problems = weeks.flatMap((week) =>
    week.sessions.length === 0
      ? [`La semana ${String(week.weekNo)} no tiene sesiones.`]
      : week.sessions.flatMap((session) =>
          session.exercises.length === 0
            ? [`Semana ${String(week.weekNo)}, ${session.name}: no tiene ejercicios.`]
            : [],
        ),
  );
  if (program.origin === 'PROPOSAL') {
    const pending = new Set(
      weeks.flatMap((week) =>
        week.sessions.flatMap((session) =>
          session.exercises
            .filter((exercise) => exercise.approvedAt === null)
            .map((exercise) => `${String(session.position)}:${String(exercise.position)}`),
        ),
      ),
    );
    if (pending.size > 0) {
      problems.push(
        pending.size === 1
          ? 'Falta 1 ejercicio por aprobar.'
          : `Faltan ${String(pending.size)} ejercicios por aprobar.`,
      );
    }
  }
  return problems;
}

/** Las sesiones de otra semana con ids nuevos: duplicar no comparte filas. */
export function copySessions(
  sessions: readonly ProgramSession[],
  newId: () => string,
): readonly ProgramSession[] {
  return sessions.map((session) => ({
    ...session,
    id: newId(),
    exercises: session.exercises.map((exercise) => ({ ...exercise, id: newId() })),
  }));
}

/** Una copia del programa con ids nuevos: la versión siguiente de una rutina (RN-F12). */
export function copyMesocycles(
  mesocycles: readonly Mesocycle[],
  newId: () => string,
): readonly Mesocycle[] {
  return mesocycles.map((mesocycle) => ({
    ...mesocycle,
    id: newId(),
    weeks: mesocycle.weeks.map((week) => ({
      ...week,
      id: newId(),
      sessions: copySessions(week.sessions, newId),
    })),
  }));
}

export interface SessionInput {
  readonly name: string;
  readonly dayOfWeek: number | null;
  readonly notes: string | null;
  readonly exercises: readonly {
    readonly id: string | null;
    readonly exerciseId: string;
    readonly supersetGroup: string | null;
    readonly notes: string | null;
    readonly sets: readonly Omit<PrescribedSet, 'setNo'>[];
  }[];
}

/**
 * Las sesiones que manda el coach sobre las que había: lo que es de la propuesta no viene del navegador. Una fila conserva su
 * patrón y su sugerido; su aprobación, solo si el ejercicio es el mismo (RN-F14).
 */
export function sessionsFrom(
  input: readonly SessionInput[],
  current: readonly ProgramSession[],
  newId: () => string,
): readonly ProgramSession[] {
  const known = new Map(
    current.flatMap((session) => session.exercises).map((exercise) => [exercise.id, exercise]),
  );
  return input.map((session, sessionIndex) => ({
    id: newId(),
    position: sessionIndex + 1,
    name: session.name,
    dayOfWeek: session.dayOfWeek,
    notes: session.notes,
    exercises: session.exercises.map((exercise, exerciseIndex) => {
      const previous = exercise.id ? known.get(exercise.id) : undefined;
      known.delete(exercise.id ?? '');
      const same = previous?.exerciseId === exercise.exerciseId;
      return {
        id: previous?.id ?? newId(),
        exerciseId: exercise.exerciseId,
        position: exerciseIndex + 1,
        supersetGroup: exercise.supersetGroup,
        notes: exercise.notes,
        movementPattern: previous?.movementPattern ?? null,
        suggestedExerciseId: previous?.suggestedExerciseId ?? null,
        substitutionNote: same ? previous.substitutionNote : null,
        approvedBy: same ? previous.approvedBy : null,
        approvedAt: same ? previous.approvedAt : null,
        sets: exercise.sets.map((set, setIndex) => ({ ...set, setNo: setIndex + 1 })),
      };
    }),
  }));
}

/** La última fecha de un programa que empieza en `startDate` y dura `weeks` semanas. */
export function endDateOf(startDate: string, weeks: number): string {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + weeks * 7 - 1);
  return end.toISOString().slice(0, 10);
}
