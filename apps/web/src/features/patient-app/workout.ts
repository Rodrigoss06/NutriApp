import {
  logWorkoutSchema,
  prescriptionText,
  type LoadKind,
  type LogWorkout,
  type MeTraining,
} from '@nutricoach/contracts';
import { kg, runMethod, TONNAGE } from '@nutricoach/engine';

export type TrainingSession = MeTraining['sessions'][number];
export type SessionExercise = TrainingSession['exercises'][number];
export type PrescribedSet = SessionExercise['sets'][number];

/** Una serie de cardio se prescribe en minutos, metros o MET (RN-F10), no en repeticiones. */
export const isCardio = (set: PrescribedSet): boolean =>
  set.durationSeconds !== null || set.distanceM !== null || set.met !== null;

/** El esfuerzo que se anota: RPE si así se prescribió; si no, RIR (RF-29). */
export const effortKind = (set: PrescribedSet): 'RIR' | 'RPE' =>
  set.loadKind === 'RPE' ? 'RPE' : 'RIR';

/**
 * Lo prescrito de una serie como se dice: «8 a 12 rep · RIR 2 · 90 s» o «20 min · MET 6», con el texto de contracts: «/lado» en
 * un unilateral, los segundos de una isometría y «esfuerzo suave (RPE 5–6)» en la movilidad y el cardio (P-34, ADR-114).
 */
export function prescribedText(
  set: PrescribedSet,
  exercise: Pick<SessionExercise, 'isUnilateral' | 'modality' | 'baseMeasure'> = {
    isUnilateral: false,
    modality: null,
    baseMeasure: null,
  },
): string {
  return prescriptionText({ ...set, loadKind: set.loadKind as LoadKind | null }, exercise);
}

/** Lo que el paciente anota de una serie; parte de lo prescrito y lo corrige si hizo otra cosa. */
export interface SetDraft {
  readonly done: boolean;
  readonly reps: number | null;
  readonly loadKg: number | null;
  /** RIR o RPE, según la serie. */
  readonly effort: number | null;
  readonly minutes: number | null;
  readonly distanceM: number | null;
}

/** La serie como se prescribió: las repeticiones de arriba del rango, los kg y el RIR o RPE indicados; sin marcar hecha. */
export function draftOf(set: PrescribedSet): SetDraft {
  return {
    done: false,
    reps: set.repsMax ?? set.repsMin,
    loadKg: set.loadKind === 'KG' ? set.loadValue : null,
    effort: set.loadKind === 'RIR' || set.loadKind === 'RPE' ? set.loadValue : null,
    minutes: set.durationSeconds === null ? null : set.durationSeconds / 60,
    distanceM: set.distanceM,
  };
}

export interface ExerciseRating {
  readonly stimulus: number | null;
  readonly fatigue: number | null;
}

export interface SessionDraft {
  readonly sets: Readonly<Record<string, readonly SetDraft[]>>;
  /** Estímulo y fatiga de cada ejercicio: se guardan en cada una de sus series (RF-29, ADR-084). */
  readonly ratings: Readonly<Record<string, ExerciseRating>>;
  readonly durationMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly notes: string;
}

export function sessionDraftOf(session: TrainingSession): SessionDraft {
  return {
    sets: Object.fromEntries(
      session.exercises.map((exercise) => [exercise.id, exercise.sets.map(draftOf)]),
    ),
    ratings: Object.fromEntries(
      session.exercises.map((exercise) => [exercise.id, { stimulus: null, fatigue: null }]),
    ),
    durationMinutes: null,
    sessionRpe: null,
    notes: '',
  };
}

interface Entry {
  readonly exercise: SessionExercise;
  readonly set: PrescribedSet;
  readonly draft: SetDraft;
}

const entriesOf = (session: TrainingSession, draft: SessionDraft): Entry[] =>
  session.exercises.flatMap((exercise) =>
    exercise.sets.map((set, index) => ({
      exercise,
      set,
      draft: draft.sets[exercise.id]?.[index] ?? draftOf(set),
    })),
  );

/** Cuántas series se marcaron hechas, de todas. */
export function progressOf(
  session: TrainingSession,
  draft: SessionDraft,
): { readonly done: number; readonly total: number } {
  const entries = entriesOf(session, draft);
  return { done: entries.filter((entry) => entry.draft.done).length, total: entries.length };
}

/**
 * El tonelaje a la vista mientras se registra (RN-F03), con el mismo método del motor (TONNAGE): peso × repeticiones de las series
 * hechas, sin el calentamiento. El cardio no suma tonelaje. Es una vista previa: el que vale lo calcula la API.
 */
export function liveTonnageKg(session: TrainingSession, draft: SessionDraft): number {
  const sets = entriesOf(session, draft)
    .filter(({ set, draft: setDraft }) => setDraft.done && !isCardio(set))
    .map(({ exercise, set, draft: setDraft }) => ({
      exercise: exercise.exerciseId,
      loadKg: kg(setDraft.loadKg ?? 0),
      reps: setDraft.reps ?? 0,
      warmup: set.setType === 'WARMUP',
    }));
  const run = runMethod(TONNAGE, { sets });
  return run.ok ? run.result.outputs.tonnageKg : 0;
}

/**
 * El registro de la sesión (RF-29): las series hechas, completa si se hicieron todas y parcial si no. Valida con el contrato
 * de la API; si algo no pasa, dice qué serie revisar.
 */
export function workoutBody(
  session: TrainingSession,
  draft: SessionDraft,
  day: { readonly clientId: string; readonly localDate: string },
): { ok: true; body: LogWorkout } | { ok: false; problems: readonly string[] } {
  const entries = entriesOf(session, draft);
  const done = entries.filter((entry) => entry.draft.done);
  const parsed = logWorkoutSchema.safeParse({
    ...day,
    sessionId: session.id,
    outcome: done.length === entries.length ? 'COMPLETED' : 'PARTIAL',
    durationMinutes: draft.durationMinutes,
    sessionRpe: draft.sessionRpe,
    notes: draft.notes.trim() || null,
    sets: done.map(({ exercise, set, draft: setDraft }) => {
      const cardio = isCardio(set);
      const kind = effortKind(set);
      const rating = draft.ratings[exercise.id];
      return {
        exerciseId: exercise.exerciseId,
        setNo: set.setNo,
        isWarmup: set.setType === 'WARMUP',
        reps: cardio ? null : setDraft.reps,
        loadKg: cardio ? null : setDraft.loadKg,
        rir: !cardio && kind === 'RIR' ? setDraft.effort : null,
        rpe: !cardio && kind === 'RPE' ? setDraft.effort : null,
        durationSeconds:
          cardio && setDraft.minutes !== null ? Math.round(setDraft.minutes * 60) : null,
        distanceM: cardio ? setDraft.distanceM : null,
        met: cardio ? set.met : null,
        stimulus: rating?.stimulus ?? null,
        fatigue: rating?.fatigue ?? null,
      };
    }),
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  const problems = new Set<string>();
  for (const issue of parsed.error.issues) {
    const [field, index, setField] = issue.path;
    if (field === 'sets' && typeof index === 'number') {
      const entry = done[index];
      problems.add(
        entry
          ? `${entry.exercise.name}, serie ${String(entry.set.setNo)}: revisa ${SET_FIELD_NAMES[String(setField)] ?? 'sus datos'}.`
          : 'Revisa las series marcadas.',
      );
    } else {
      problems.add(SESSION_FIELD_NAMES[String(field)] ?? 'Revisa los datos de la sesión.');
    }
  }
  return { ok: false, problems: [...problems] };
}

const SET_FIELD_NAMES: Readonly<Record<string, string>> = {
  reps: 'las repeticiones (de 0 a 600, sin decimales)',
  loadKg: 'el peso (hasta 2 decimales)',
  rir: 'el RIR (de 0 a 10, sin decimales)',
  rpe: 'el RPE (de 0 a 10, con hasta 1 decimal)',
  durationSeconds: 'los minutos',
  distanceM: 'la distancia',
  stimulus: 'el estímulo',
  fatigue: 'la fatiga',
};

const SESSION_FIELD_NAMES: Readonly<Record<string, string>> = {
  durationMinutes: 'Revisa la duración: de 0 a 600 minutos, sin decimales.',
  sessionRpe: 'Revisa el RPE de la sesión: de 0 a 10, con hasta 1 decimal.',
  notes: 'Las notas tienen hasta 2000 caracteres.',
};

/** «No entrené esta sesión»: queda omitida, sin series (RF-29). */
export function skippedBody(
  session: TrainingSession,
  day: { readonly clientId: string; readonly localDate: string },
): LogWorkout {
  return { ...day, sessionId: session.id, outcome: 'SKIPPED', sets: [] };
}
