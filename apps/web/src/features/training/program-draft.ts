import {
  LOAD_KIND_LABELS,
  REVIEW_KIND_LABELS,
  saveProgramWeekSchema,
  TRAINING_INTENSITY_LABELS,
  WEEKDAY_LABELS,
  type LoadKind,
  type ProgramDocument,
  type SaveProgramWeek,
  type SetType,
} from '@nutricoach/contracts';
import { parseDecimal } from '@nutricoach/ui';

export type ProgramWeek = ProgramDocument['mesocycles'][number]['weeks'][number];
type ProgramSession = ProgramWeek['sessions'][number];
type ProgramExercise = ProgramSession['exercises'][number];
type ProgramSet = ProgramExercise['sets'][number];

/** En una lista desplegable, «sin valor». */
export const NONE = 'NONE';

/** Una serie mientras se escribe: todo texto hasta guardar. El cardio se escribe en minutos (RN-F10). */
export interface SetDraft {
  readonly key: string;
  readonly setType: SetType;
  readonly repsMin: string;
  readonly repsMax: string;
  readonly loadKind: LoadKind | typeof NONE;
  readonly loadValue: string;
  readonly restSeconds: string;
  readonly tempo: string;
  readonly minutes: string;
  readonly distanceM: string;
  readonly met: string;
}

export interface ExerciseDraft {
  readonly key: string;
  /** La fila ya guardada: así conserva su aprobación si el ejercicio no cambia (RN-F14). */
  readonly id: string | null;
  readonly exerciseId: string;
  readonly name: string;
  readonly supersetGroup: string;
  readonly notes: string;
  readonly approved: boolean;
  readonly sets: readonly SetDraft[];
}

export interface SessionDraft {
  readonly key: string;
  readonly name: string;
  readonly dayOfWeek: string;
  readonly notes: string;
  readonly exercises: readonly ExerciseDraft[];
}

/** Una semana mientras se escribe: su fase, que el coach también edita (P-07), y sus sesiones. */
export interface WeekDraft {
  readonly isDeload: boolean;
  readonly phaseEs: string;
  readonly phaseGoalEs: string;
  readonly volumeFactor: string;
  readonly intensity: NonNullable<ProgramWeek['intensity']> | typeof NONE;
  readonly targetRir: string;
  readonly reviewKind: NonNullable<ProgramWeek['reviewKind']> | typeof NONE;
  readonly sessions: readonly SessionDraft[];
}

let nextKey = 0;
/** Una clave para React: las filas nuevas no tienen id hasta guardarse. Las guardadas la derivan de lo que son, y al guardar sigue abierto lo que estaba abierto. */
const newKey = (): string => `fila-${String((nextKey += 1))}`;

const text = (value: number | null): string => (value === null ? '' : String(value));
/** Con 2 decimales, los segundos vuelven iguales al guardar. */
const minutesOf = (seconds: number | null): string =>
  seconds === null ? '' : String(Math.round((seconds / 60) * 100) / 100);

export const setDraftOf = (set: ProgramSet): SetDraft => ({
  key: `serie-${String(set.setNo)}`,
  setType: set.setType,
  repsMin: text(set.repsMin),
  repsMax: text(set.repsMax),
  loadKind: set.loadKind ?? NONE,
  loadValue: text(set.loadValue),
  restSeconds: text(set.restSeconds),
  tempo: set.tempo ?? '',
  minutes: minutesOf(set.durationSeconds),
  distanceM: text(set.distanceM),
  met: text(set.met),
});

/** Lo guardado de una semana, para editarlo. */
export const weekDraftOf = (week: ProgramWeek): WeekDraft => ({
  isDeload: week.isDeload,
  phaseEs: week.phaseEs ?? '',
  phaseGoalEs: week.phaseGoalEs ?? '',
  volumeFactor: text(week.volumeFactor),
  intensity: week.intensity ?? NONE,
  targetRir: text(week.targetRir),
  reviewKind: week.reviewKind ?? NONE,
  sessions: week.sessions.map((session) => ({
    key: `sesion-${String(session.position)}`,
    name: session.name,
    dayOfWeek: session.dayOfWeek === null ? NONE : String(session.dayOfWeek),
    notes: session.notes ?? '',
    exercises: session.exercises.map((exercise) => ({
      key: exercise.id,
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      supersetGroup: exercise.supersetGroup ?? '',
      notes: exercise.notes ?? '',
      approved: exercise.approvedAt !== null,
      sets: exercise.sets.map(setDraftOf),
    })),
  })),
});

/** Los valores base de la plantilla (07 §6): 3 series de 8 a 12, RIR 2, tempo 2-1-2 y 90 s. El coach los ajusta. */
const baseSet = (): SetDraft => ({
  key: newKey(),
  setType: 'WORKING',
  repsMin: '8',
  repsMax: '12',
  loadKind: 'RIR',
  loadValue: '2',
  restSeconds: '90',
  tempo: '2-1-2',
  minutes: '',
  distanceM: '',
  met: '',
});

/** Otra serie igual a la última: es lo que se quiere casi siempre. */
export const nextSet = (sets: readonly SetDraft[]): SetDraft => {
  const last = sets.at(-1);
  return last ? { ...last, key: newKey() } : baseSet();
};

export const newExerciseDraft = (exercise: {
  readonly id: string;
  readonly name: string;
}): ExerciseDraft => ({
  key: newKey(),
  id: null,
  exerciseId: exercise.id,
  name: exercise.name,
  supersetGroup: '',
  notes: '',
  approved: false,
  sets: [baseSet(), baseSet(), baseSet()],
});

export const newSessionDraft = (position: number): SessionDraft => ({
  key: newKey(),
  name: `Sesión ${String(position)}`,
  dayOfWeek: NONE,
  notes: '',
  exercises: [],
});

export const replaceAt = <T>(items: readonly T[], index: number, item: T): readonly T[] =>
  items.map((current, position) => (position === index ? item : current));

export const removeAt = <T>(items: readonly T[], index: number): readonly T[] =>
  items.filter((_, position) => position !== index);

/** Cambia de lugar una fila con su vecina; en los extremos no hace nada. */
export const moveAt = <T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] => {
  const item = items[index];
  const other = items[index + delta];
  if (item === undefined || other === undefined) return items;
  return replaceAt(replaceAt(items, index, other), index + delta, item);
};

const signature = (value: unknown): string =>
  JSON.stringify(value, (name: string, item: unknown) => (name === 'key' ? undefined : item));

/** Si dos borradores dicen lo mismo, sin mirar las claves de React. */
export const sameDraft = (a: WeekDraft, b: WeekDraft): boolean => signature(a) === signature(b);

/** Vacío es null; lo que no se lee como número no pasa el contrato. */
const numberOf = (value: string): number | null => {
  if (value.trim() === '') return null;
  return parseDecimal(value) ?? Number.NaN;
};

const FIELD_NAMES: Readonly<Record<string, string>> = {
  repsMin: 'las repeticiones mínimas',
  repsMax: 'las repeticiones máximas',
  loadValue: 'el valor de la carga',
  restSeconds: 'el descanso',
  tempo: 'el tempo',
  durationSeconds: 'los minutos',
  distanceM: 'la distancia',
  met: 'los MET',
  name: 'el nombre',
  notes: 'las notas',
  sets: 'las series',
  exercises: 'los ejercicios',
  sessions: 'las sesiones',
  phaseEs: 'la fase',
  phaseGoalEs: 'el objetivo de la fase',
  volumeFactor: 'el factor de volumen',
  targetRir: 'el RIR objetivo',
};

const problemOf = (path: readonly PropertyKey[]): string => {
  const what = `revisa ${FIELD_NAMES[String(path.at(-1))] ?? 'este dato'}.`;
  if (path[0] !== 'sessions' || path.length === 1) return `Semana: ${what}`;
  const [, session, , exercise, , set] = path;
  const where = [
    `Sesión ${String(Number(session) + 1)}`,
    exercise === undefined ? null : `ejercicio ${String(Number(exercise) + 1)}`,
    set === undefined ? null : `serie ${String(Number(set) + 1)}`,
  ]
    .filter(Boolean)
    .join(', ');
  return `${where}: ${what}`;
};

/** Valida con el mismo contrato que la API y devuelve el cuerpo, o qué revisar y dónde. */
export function weekBodyOf(
  draft: WeekDraft,
): { ok: true; body: SaveProgramWeek } | { ok: false; problems: readonly string[] } {
  const parsed = saveProgramWeekSchema.safeParse({
    isDeload: draft.isDeload,
    phaseEs: draft.phaseEs.trim() || null,
    phaseGoalEs: draft.phaseGoalEs.trim() || null,
    volumeFactor: numberOf(draft.volumeFactor),
    intensity: draft.intensity === NONE ? null : draft.intensity,
    targetRir: numberOf(draft.targetRir),
    reviewKind: draft.reviewKind === NONE ? null : draft.reviewKind,
    sessions: draft.sessions.map((session) => ({
      name: session.name,
      dayOfWeek: session.dayOfWeek === NONE ? null : Number(session.dayOfWeek),
      notes: session.notes,
      exercises: session.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        supersetGroup: exercise.supersetGroup || null,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => {
          const minutes = numberOf(set.minutes);
          return {
            setType: set.setType,
            repsMin: numberOf(set.repsMin),
            repsMax: numberOf(set.repsMax),
            loadKind: set.loadKind === NONE ? null : set.loadKind,
            loadValue: numberOf(set.loadValue),
            restSeconds: numberOf(set.restSeconds),
            tempo: set.tempo,
            durationSeconds: minutes === null ? null : Math.round(minutes * 60),
            distanceM: numberOf(set.distanceM),
            met: numberOf(set.met),
          };
        }),
      })),
    })),
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  return {
    ok: false,
    problems: [...new Set(parsed.error.issues.map(({ path }) => problemOf(path)))],
  };
}

/** La carga como se dice: «60 kg», «80 % de 1RM», «RIR 2» o «Peso corporal». */
export function loadText(kind: LoadKind | typeof NONE | null, value: string): string | null {
  if (kind === null || kind === NONE) return null;
  if (kind === 'BODYWEIGHT') return LOAD_KIND_LABELS.BODYWEIGHT;
  if (kind === 'KG' || kind === 'PCT_1RM') return `${value} ${LOAD_KIND_LABELS[kind]}`.trim();
  return `${kind} ${value}`.trim();
}

/** Lo que se ve de un ejercicio sin abrirlo: «3 series · 8 a 12 rep · RIR 2 · 90 s». */
export function setsSummary(sets: readonly SetDraft[]): string {
  const [first] = sets;
  if (!first) return 'Sin series';
  const count = sets.length === 1 ? '1 serie' : `${String(sets.length)} series`;
  if (!sets.every((set) => signature(set) === signature(first))) return `${count} distintas`;
  const reps =
    first.repsMin && first.repsMax && first.repsMin !== first.repsMax
      ? `${first.repsMin} a ${first.repsMax} rep`
      : first.repsMin || first.repsMax
        ? `${first.repsMin || first.repsMax} rep`
        : null;
  return [
    count,
    reps,
    first.minutes ? `${first.minutes} min` : null,
    loadText(first.loadKind, first.loadValue),
    first.restSeconds ? `${first.restSeconds} s` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface ProposalBlock {
  readonly day: number;
  readonly dayName: string;
  readonly order: number;
  /** El de la primera semana en la que aparece; sus series cambian con el volumen de cada semana. */
  readonly exercise: ProgramExercise;
  readonly weekNo: number;
  readonly approved: boolean;
  readonly substituted: boolean;
  /** Las semanas en las que el bloque tiene otro ejercicio: aprobarlo también aprueba esos (RN-F14). */
  readonly otherExercises: readonly { readonly name: string; readonly weeks: readonly number[] }[];
}

const withOther = (
  others: ProposalBlock['otherExercises'],
  name: string,
  weekNo: number,
): ProposalBlock['otherExercises'] =>
  others.some((other) => other.name === name)
    ? others.map((other) =>
        other.name === name ? { name, weeks: [...other.weeks, weekNo] } : other,
      )
    : [...others, { name, weeks: [weekNo] }];

/** Los bloques de la propuesta, por día y orden. Un bloque queda aprobado cuando lo está en todas sus semanas. */
export function proposalBlocks(document: ProgramDocument): readonly ProposalBlock[] {
  const blocks = new Map<string, ProposalBlock>();
  for (const week of weeksOfDocument(document)) {
    for (const session of week.sessions) {
      for (const exercise of session.exercises) {
        const key = `${String(session.position)}:${String(exercise.position)}`;
        const seen = blocks.get(key);
        blocks.set(
          key,
          seen
            ? {
                ...seen,
                approved: seen.approved && exercise.approvedAt !== null,
                otherExercises:
                  exercise.exerciseId === seen.exercise.exerciseId
                    ? seen.otherExercises
                    : withOther(seen.otherExercises, exercise.name, week.weekNo),
              }
            : {
                day: session.position,
                dayName: session.name,
                order: exercise.position,
                exercise,
                weekNo: week.weekNo,
                approved: exercise.approvedAt !== null,
                substituted:
                  exercise.suggestedExerciseId !== null &&
                  exercise.exerciseId !== exercise.suggestedExerciseId,
                otherExercises: [],
              },
        );
      }
    }
  }
  return [...blocks.values()].sort((a, b) => a.day - b.day || a.order - b.order);
}

export const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/** La fase de una semana en pocas palabras (RN-F13). */
export const phaseSummary = (week: ProgramWeek): readonly string[] =>
  [
    week.isDeload && week.phaseEs !== 'Descarga' ? 'Descarga' : null,
    week.phaseEs,
    week.phaseGoalEs,
    week.volumeFactor === null ? null : `Volumen × ${String(week.volumeFactor)}`,
    week.intensity === null
      ? null
      : `Intensidad ${TRAINING_INTENSITY_LABELS[week.intensity].toLowerCase()}`,
    week.targetRir === null ? null : `RIR ${String(week.targetRir)}`,
    week.reviewKind === null ? null : REVIEW_KIND_LABELS[week.reviewKind],
  ].filter((part) => part !== null);

/** Las series de la semana por grupo muscular, de mayor a menor: la suma de lo que da la API por sesión (RN-F06). */
export function weekSetsByMuscle(week: ProgramWeek): readonly (readonly [string, number])[] {
  const totals = new Map<string, number>();
  for (const session of week.sessions) {
    for (const [muscle, sets] of Object.entries(session.setsByMuscle)) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + sets);
    }
  }
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Los nombres de los músculos que aparecen en el programa, para mostrar las series por grupo muscular. */
export function muscleNames(document: ProgramDocument): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const week of weeksOfDocument(document)) {
    for (const exercise of week.sessions.flatMap((session) => session.exercises)) {
      for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
        names.set(muscle.code, muscle.name);
      }
    }
  }
  return names;
}

/** Las semanas de un mesociclo, que son contiguas: «semana 3» o «semanas 1 a 4». */
export function weekRange(weeks: readonly Pick<ProgramWeek, 'weekNo'>[]): string {
  const first = weeks[0]?.weekNo;
  const last = weeks.at(-1)?.weekNo;
  if (first === undefined || last === undefined) return '';
  return first === last ? `semana ${String(first)}` : `semanas ${String(first)} a ${String(last)}`;
}

export const weeksOfDocument = (document: ProgramDocument): readonly ProgramWeek[] =>
  document.mesocycles.flatMap((mesocycle) => mesocycle.weeks);
