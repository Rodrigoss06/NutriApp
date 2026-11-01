import { canonicalJson, type MethodCode } from '@nutricoach/engine';
import type { ProgramSnapshot } from '../../../training/index.js';
import type { SheetMethod, SheetPatient } from './sheet-content.js';

type SnapshotWeek = ProgramSnapshot['mesocycles'][number]['weeks'][number];
type SnapshotSession = SnapshotWeek['sessions'][number];
type SnapshotExercise = SnapshotSession['exercises'][number];
type SnapshotSet = SnapshotExercise['sets'][number];

/** Una serie como se prescribió (02 §7): el cardio, con su duración en segundos (RN-F10). */
export type TrainingSheetSet = SnapshotSet;

/** Una sesión como se imprime: sin ids ni lo que es de la aprobación. */
export interface TrainingSheetSession {
  readonly position: number;
  readonly dayOfWeek: number | null;
  readonly name: string;
  readonly notes: string | null;
  readonly exercises: readonly {
    readonly name: string;
    readonly supersetGroup: string | null;
    readonly notes: string | null;
    readonly sets: readonly TrainingSheetSet[];
  }[];
}

/**
 * La ficha de la rutina publicada (RN-H01, ADR-079), desde su snapshot (RN-F12): el programa, su macrociclo (RN-F13), cada semana con
 * sus sesiones y las series por grupo muscular con su método (RN-F06, RN-H04), y cada ejercicio una vez, con sus músculos, su
 * precaución y sus variantes (RN-F11). Las semanas iguales se imprimen juntas. La nota de la sustitución es de la aprobación y no va.
 */
export interface TrainingSheet {
  readonly kind: 'TRAINING';
  readonly patient: SheetPatient;
  readonly program: {
    readonly name: string;
    readonly versionNo: number;
    readonly goal: string | null;
    readonly origin: ProgramSnapshot['origin'];
    readonly objective: ProgramSnapshot['objective'];
    readonly level: ProgramSnapshot['level'];
    readonly daysPerWeek: number | null;
    readonly split: ProgramSnapshot['split'];
    readonly oneRmFormula: ProgramSnapshot['oneRmFormula'];
    /** YYYY-MM-DD: el primer día y el último. */
    readonly startDate: string;
    readonly endDate: string;
    readonly totalWeeks: number;
    /** La versión de la tabla de fases que usó (RN-F13); a mano, null. */
    readonly periodizationValidFrom: string | null;
    readonly engineVersion: string;
  };
  readonly mesocycles: readonly {
    readonly name: string;
    readonly focus: string | null;
    readonly weeks: readonly number[];
  }[];
  /** Una fila por semana con su fase; vacío si ninguna semana tiene fase. */
  readonly macrocycle: readonly {
    readonly weekNo: number;
    readonly isDeload: boolean;
    readonly phase: string | null;
    readonly phaseGoal: string | null;
    readonly volumeFactor: number | null;
    readonly intensity: SnapshotWeek['intensity'];
    readonly targetRir: number | null;
    readonly reviewKind: SnapshotWeek['reviewKind'];
  }[];
  /** Las semanas con las mismas sesiones, una vez, en el orden en que aparecen. */
  readonly blocks: readonly {
    readonly weeks: readonly number[];
    readonly sessions: readonly TrainingSheetSession[];
    /** Por nombre del músculo, de mayor a menor. */
    readonly setsByMuscle: readonly { readonly muscle: string; readonly sets: number }[];
  }[];
  /** Cada ejercicio una vez, en el orden en que aparece. */
  readonly exercises: readonly {
    readonly name: string;
    readonly primaryMuscles: readonly string[];
    readonly secondaryMuscles: readonly string[];
    readonly caution: string | null;
    readonly alternative: string | null;
    readonly easierVariant: string | null;
    readonly harderVariant: string | null;
  }[];
  readonly methods: readonly SheetMethod[];
}

type Block = TrainingSheet['blocks'][number];

const sessionOf = (session: SnapshotSession): TrainingSheetSession => ({
  position: session.position,
  dayOfWeek: session.dayOfWeek,
  name: session.name,
  notes: session.notes,
  exercises: session.exercises.map((exercise) => ({
    name: exercise.name,
    supersetGroup: exercise.supersetGroup,
    notes: exercise.notes,
    sets: exercise.sets.map((set) => ({
      setNo: set.setNo,
      setType: set.setType,
      repsMin: set.repsMin,
      repsMax: set.repsMax,
      loadKind: set.loadKind,
      loadValue: set.loadValue,
      restSeconds: set.restSeconds,
      tempo: set.tempo,
      durationSeconds: set.durationSeconds,
      distanceM: set.distanceM,
      met: set.met,
    })),
  })),
});

/** Las series de la semana por grupo muscular: la suma de las de cada sesión, como las da el motor (RN-F06). */
function setsByMuscleOf(
  week: SnapshotWeek,
  names: ReadonlyMap<string, string>,
): Block['setsByMuscle'] {
  const totals = new Map<string, number>();
  for (const session of week.sessions) {
    for (const [code, sets] of Object.entries(session.setsByMuscle)) {
      totals.set(code, (totals.get(code) ?? 0) + sets);
    }
  }
  return [...totals]
    .map(([code, sets]) => ({ muscle: names.get(code) ?? code, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle, 'es'));
}

const hasPhase = (week: SnapshotWeek): boolean =>
  week.isDeload ||
  [
    week.phaseEs,
    week.phaseGoalEs,
    week.volumeFactor,
    week.intensity,
    week.targetRir,
    week.reviewKind,
  ].some((value) => value !== null);

/** La ficha de una rutina publicada, desde su snapshot (RN-F12): lo que se publicó, nada más. */
export function trainingSheet(snapshot: ProgramSnapshot, patient: SheetPatient): TrainingSheet {
  const weeks = snapshot.mesocycles.flatMap((mesocycle) => mesocycle.weeks);
  const all = weeks.flatMap((week) => week.sessions).flatMap((session) => session.exercises);
  const muscleNames = new Map(
    all
      .flatMap((exercise) => [...exercise.primaryMuscles, ...exercise.secondaryMuscles])
      .map(({ code, name }) => [code, name]),
  );

  const blocks: Block[] = [];
  const bySignature = new Map<string, number>();
  for (const week of weeks) {
    const sessions = week.sessions.map(sessionOf);
    const setsByMuscle = setsByMuscleOf(week, muscleNames);
    // Lo que se imprime y sus series por músculo: dos ejercicios con el mismo nombre y otros músculos no se juntan.
    const signature = canonicalJson([sessions, setsByMuscle]);
    const index = bySignature.get(signature);
    const block = index === undefined ? undefined : blocks[index];
    if (index !== undefined && block) {
      blocks[index] = { ...block, weeks: [...block.weeks, week.weekNo] };
    } else {
      bySignature.set(signature, blocks.length);
      blocks.push({ weeks: [week.weekNo], sessions, setsByMuscle });
    }
  }

  const exercises = new Map<string, TrainingSheet['exercises'][number]>();
  for (const exercise of all) {
    if (exercises.has(exercise.exerciseId)) continue;
    exercises.set(exercise.exerciseId, {
      name: exercise.name,
      primaryMuscles: exercise.primaryMuscles.map(({ name }) => name),
      secondaryMuscles: exercise.secondaryMuscles.map(({ name }) => name),
      caution: exercise.caution,
      alternative: exercise.alternative?.name ?? null,
      easierVariant: exercise.easierVariant?.name ?? null,
      harderVariant: exercise.harderVariant?.name ?? null,
    });
  }

  return {
    kind: 'TRAINING',
    patient,
    program: {
      name: snapshot.name,
      versionNo: snapshot.versionNo,
      goal: snapshot.goal,
      origin: snapshot.origin,
      objective: snapshot.objective,
      level: snapshot.level,
      daysPerWeek: snapshot.daysPerWeek,
      split: snapshot.split,
      oneRmFormula: snapshot.oneRmFormula,
      startDate: snapshot.startDate,
      endDate: snapshot.endDate,
      totalWeeks: snapshot.totalWeeks,
      periodizationValidFrom: snapshot.periodizationValidFrom,
      engineVersion: snapshot.engineVersion,
    },
    mesocycles: snapshot.mesocycles.map((mesocycle) => ({
      name: mesocycle.name,
      focus: mesocycle.focus,
      weeks: mesocycle.weeks.map((week) => week.weekNo),
    })),
    macrocycle: weeks.some(hasPhase)
      ? weeks.map((week) => ({
          weekNo: week.weekNo,
          isDeload: week.isDeload,
          phase: week.phaseEs,
          phaseGoal: week.phaseGoalEs,
          volumeFactor: week.volumeFactor,
          intensity: week.intensity,
          targetRir: week.targetRir,
          reviewKind: week.reviewKind,
        }))
      : [],
    blocks,
    exercises: [...exercises.values()],
    methods: [
      {
        methodCode: snapshot.setsMethod.code as MethodCode,
        methodVersion: snapshot.setsMethod.version,
      },
    ],
  };
}
