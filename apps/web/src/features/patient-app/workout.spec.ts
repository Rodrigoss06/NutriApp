import { logWorkoutSchema } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  draftOf,
  liveTonnageKg,
  prescribedText,
  progressOf,
  sessionDraftOf,
  skippedBody,
  workoutBody,
  type PrescribedSet,
  type SessionDraft,
  type TrainingSession,
} from './workout';

const SET: PrescribedSet = {
  setNo: 1,
  setType: 'WORKING',
  repsMin: 8,
  repsMax: 8,
  loadKind: 'KG',
  loadValue: 60,
  restSeconds: 90,
  tempo: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
};
const CARDIO: PrescribedSet = {
  ...SET,
  setNo: 1,
  repsMin: null,
  repsMax: null,
  loadKind: null,
  loadValue: null,
  restSeconds: null,
  durationSeconds: 1_200,
  met: 6,
};
const exercise = (id: string, sets: PrescribedSet[]) => ({
  id,
  exerciseId:
    id === 'squat'
      ? '0193a000-0000-7000-8000-0000000000b1'
      : '0193a000-0000-7000-8000-0000000000b2',
  name: id === 'squat' ? 'Sentadilla goblet' : 'Caminata inclinada',
  supersetGroup: null,
  notes: null,
  caution: null,
  alternative: null,
  easierVariant: null,
  harderVariant: null,
  mediaUrl: null,
  instructions: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  sets,
});
const SESSION: TrainingSession = {
  id: '0193a000-0000-7000-8000-0000000000a1',
  position: 1,
  name: 'Sesión 1',
  dayOfWeek: null,
  notes: null,
  plannedTonnageKg: 960,
  exercises: [
    exercise('squat', [
      { ...SET, setNo: 1, setType: 'WARMUP', loadValue: 20 },
      SET,
      { ...SET, setNo: 3 },
    ]),
    exercise('walk', [CARDIO]),
  ],
};
const DAY = { clientId: '0193a000-0000-7000-8000-000000000001', localDate: '2026-11-04' };

/** Marca hechas las series indicadas: [ejercicio, índice]. */
function marking(draft: SessionDraft, done: readonly [string, number][]): SessionDraft {
  const sets = { ...draft.sets };
  for (const [id, index] of done) {
    sets[id] = (sets[id] ?? []).map((set, i) => (i === index ? { ...set, done: true } : set));
  }
  return { ...draft, sets };
}

describe('RF-29 · lo prescrito de cada serie, como se dice', () => {
  it('repeticiones, carga y descanso; un rango y el RIR; el cardio en minutos con su MET', () => {
    expect(prescribedText(SET)).toBe('8 rep · 60 kg · 90 s');
    expect(prescribedText({ ...SET, repsMax: 12, loadKind: 'RIR', loadValue: 2 })).toBe(
      '8 a 12 rep · RIR 2 · 90 s',
    );
    expect(prescribedText({ ...SET, loadKind: 'BODYWEIGHT', loadValue: null })).toBe(
      '8 rep · Peso corporal · 90 s',
    );
    expect(prescribedText(CARDIO)).toBe('20 min · MET 6');
  });

  it('se anota partiendo de lo prescrito: la parte alta del rango, los kg y el RIR indicados, sin marcar hecha', () => {
    expect(draftOf({ ...SET, repsMax: 12, loadKind: 'RIR', loadValue: 2 })).toEqual({
      done: false,
      reps: 12,
      loadKg: null,
      effort: 2,
      minutes: null,
      distanceM: null,
    });
    expect(draftOf(SET)).toMatchObject({ reps: 8, loadKg: 60, effort: null });
    expect(draftOf(CARDIO)).toMatchObject({ minutes: 20, reps: null });
  });
});

describe('RN-F03 · el tonelaje a la vista', () => {
  it('peso × repeticiones de las series hechas, sin el calentamiento ni el cardio', () => {
    const draft = marking(sessionDraftOf(SESSION), [
      ['squat', 0],
      ['squat', 1],
      ['walk', 0],
    ]);

    expect(liveTonnageKg(SESSION, draft)).toBe(480);
    expect(progressOf(SESSION, draft)).toEqual({ done: 3, total: 4 });
  });
});

describe('RF-29 · ADR-084 · el registro de la sesión', () => {
  it('todas hechas es completa; el estímulo y la fatiga del ejercicio van en cada serie; el cardio, en segundos', () => {
    const draft: SessionDraft = {
      ...marking(sessionDraftOf(SESSION), [
        ['squat', 0],
        ['squat', 1],
        ['squat', 2],
        ['walk', 0],
      ]),
      ratings: { squat: { stimulus: 4, fatigue: 3 }, walk: { stimulus: null, fatigue: null } },
      durationMinutes: 50,
      sessionRpe: 7,
    };

    const result = workoutBody(SESSION, draft, DAY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toMatchObject({ outcome: 'COMPLETED', durationMinutes: 50, sessionRpe: 7 });
    expect(result.body.sets).toHaveLength(4);
    expect(result.body.sets[0]).toMatchObject({
      isWarmup: true,
      loadKg: 20,
      stimulus: 4,
      fatigue: 3,
    });
    expect(result.body.sets[1]).toMatchObject({ reps: 8, loadKg: 60, rir: null, rpe: null });
    expect(result.body.sets[3]).toMatchObject({
      reps: null,
      loadKg: null,
      durationSeconds: 1_200,
      met: 6,
    });
    expect(logWorkoutSchema.safeParse(result.body).success).toBe(true);
  });

  it('solo algunas, parcial y solo con las hechas', () => {
    const result = workoutBody(SESSION, marking(sessionDraftOf(SESSION), [['squat', 1]]), DAY);
    expect(result.ok && result.body).toMatchObject({ outcome: 'PARTIAL', sets: [{ setNo: 1 }] });
  });

  it('una serie que no pasaría en la API dice cuál revisar', () => {
    const draft = marking(sessionDraftOf(SESSION), [['squat', 1]]);
    const broken: SessionDraft = {
      ...draft,
      sets: {
        ...draft.sets,
        squat: (draft.sets['squat'] ?? []).map((set, i) => (i === 1 ? { ...set, reps: 8.5 } : set)),
      },
    };

    expect(workoutBody(SESSION, broken, DAY)).toEqual({
      ok: false,
      problems: [
        'Sentadilla goblet, serie 1: revisa las repeticiones (de 0 a 600, sin decimales).',
      ],
    });
  });

  it('«no entrené esta sesión» queda omitida y sin series', () => {
    const body = skippedBody(SESSION, DAY);
    expect(body).toMatchObject({ outcome: 'SKIPPED', sets: [] });
    expect(logWorkoutSchema.safeParse(body).success).toBe(true);
  });
});
