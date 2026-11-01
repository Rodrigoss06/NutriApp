import type { ProgramDocument } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  loadText,
  moveAt,
  muscleNames,
  newExerciseDraft,
  newSessionDraft,
  nextSet,
  phaseSummary,
  proposalBlocks,
  removeAt,
  replaceAt,
  sameDraft,
  setsSummary,
  weekRange,
  weekBodyOf,
  weekDraftOf,
  weekSetsByMuscle,
  weeksOfDocument,
  type ProgramWeek,
  type WeekDraft,
} from './program-draft';

type Session = ProgramWeek['sessions'][number];
type Exercise = Session['exercises'][number];

const SQUAT = '0192f0a0-0000-7000-8000-0000000000e1';
const ROW = '0192f0a0-0000-7000-8000-0000000000e2';
const OTHER = '0192f0a0-0000-7000-8000-0000000000e3';
const FILA = '0192f0a0-0000-7000-8000-0000000000f1';

const SET: Exercise['sets'][number] = {
  setNo: 1,
  setType: 'WORKING',
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR',
  loadValue: 2,
  restSeconds: 90,
  tempo: '2-1-2',
  durationSeconds: null,
  distanceM: null,
  met: null,
};
const exercise = (changes: Partial<Exercise> = {}): Exercise => ({
  id: FILA,
  exerciseId: SQUAT,
  name: 'Sentadilla goblet',
  pattern: 'SQUAT',
  position: 1,
  supersetGroup: null,
  notes: null,
  movementPattern: null,
  suggestedExerciseId: null,
  substitutionNote: null,
  approvedBy: null,
  approvedAt: null,
  primaryMuscles: [{ code: 'QUADRICEPS', name: 'Cuádriceps' }],
  secondaryMuscles: [{ code: 'GLUTES', name: 'Glúteo' }],
  caution: null,
  alternative: null,
  easierVariant: null,
  harderVariant: null,
  mediaUrl: null,
  instructions: null,
  sets: [SET],
  ...changes,
});
const session = (changes: Partial<Session> = {}): Session => ({
  id: 'sesion-1',
  position: 1,
  name: 'Sesión 1',
  dayOfWeek: null,
  notes: null,
  setsByMuscle: {},
  exercises: [exercise()],
  ...changes,
});
const week = (sessions: readonly Session[], weekNo = 1): ProgramWeek => ({
  id: `semana-${String(weekNo)}`,
  weekNo,
  isDeload: false,
  phaseEs: null,
  phaseGoalEs: null,
  volumeFactor: null,
  intensity: null,
  targetRir: null,
  reviewKind: null,
  sessions: [...sessions],
});
const documentOf = (weeks: readonly ProgramWeek[]): ProgramDocument => ({
  totalWeeks: weeks.length,
  setsMethod: { code: 'FRACTIONAL_SETS', version: '1.0.0' },
  mesocycles: [
    {
      id: '0192f0a0-0000-7000-8000-0000000000a1',
      position: 1,
      name: 'Base',
      focus: null,
      weeks: [...weeks],
    },
  ],
});
const emptyWeek = (sessions: WeekDraft['sessions']): WeekDraft => ({
  ...weekDraftOf(week([])),
  sessions,
});

describe('RF-26 · la semana mientras se escribe', () => {
  it('lo guardado vuelve igual al guardarse, con el id de cada fila', () => {
    const parsed = weekBodyOf(
      weekDraftOf(
        week([
          session({
            dayOfWeek: 3,
            notes: 'Nota',
            exercises: [
              exercise({
                supersetGroup: 'A',
                sets: [{ ...SET, durationSeconds: 100, distanceM: 1_500, met: 7.5 }],
              }),
            ],
          }),
        ]),
      ),
    );

    expect(parsed.ok && parsed.body.sessions[0]).toEqual({
      name: 'Sesión 1',
      dayOfWeek: 3,
      notes: 'Nota',
      exercises: [
        {
          id: FILA,
          exerciseId: SQUAT,
          supersetGroup: 'A',
          notes: null,
          sets: [
            {
              setType: 'WORKING',
              repsMin: 8,
              repsMax: 12,
              loadKind: 'RIR',
              loadValue: 2,
              restSeconds: 90,
              tempo: '2-1-2',
              durationSeconds: 100,
              distanceM: 1_500,
              met: 7.5,
            },
          ],
        },
      ],
    });
  });

  it('RN-F13: la fase de la semana también vuelve igual', () => {
    const phased: ProgramWeek = {
      ...week([]),
      isDeload: true,
      phaseEs: 'Hipertrofia',
      phaseGoalEs: 'Sobrecarga',
      volumeFactor: 1.1,
      intensity: 'MODERATE_HIGH',
      targetRir: 1,
      reviewKind: 'CONTROL',
    };

    expect(weekBodyOf(weekDraftOf(phased))).toEqual({
      ok: true,
      body: {
        isDeload: true,
        phaseEs: 'Hipertrofia',
        phaseGoalEs: 'Sobrecarga',
        volumeFactor: 1.1,
        intensity: 'MODERATE_HIGH',
        targetRir: 1,
        reviewKind: 'CONTROL',
        sessions: [],
      },
    });
    expect(weekBodyOf(weekDraftOf(week([])))).toMatchObject({
      ok: true,
      body: { phaseEs: null, volumeFactor: null, intensity: null, reviewKind: null },
    });
  });

  it('07 §6: un ejercicio nuevo parte de los valores base, sin fila guardada ni aprobación', () => {
    const draft = newExerciseDraft({ id: ROW, name: 'Remo' });

    expect(draft).toMatchObject({ id: null, exerciseId: ROW, name: 'Remo', approved: false });
    expect(draft.sets).toHaveLength(3);
    expect(setsSummary(draft.sets)).toBe('3 series · 8 a 12 rep · RIR 2 · 90 s');
  });

  it('RN-F10: el cardio se escribe en minutos y se guarda en segundos, con coma decimal', () => {
    const [base] = newExerciseDraft({ id: ROW, name: 'Cinta' }).sets;
    if (!base) throw new Error('Un ejercicio nuevo tiene series.');
    const cardio = {
      ...base,
      repsMin: '',
      repsMax: '',
      loadKind: 'NONE' as const,
      loadValue: '',
      minutes: '20,5',
      met: '7,5',
    };
    const parsed = weekBodyOf(
      emptyWeek([
        {
          ...newSessionDraft(1),
          exercises: [{ ...newExerciseDraft({ id: ROW, name: 'Cinta' }), sets: [cardio] }],
        },
      ]),
    );

    expect(parsed.ok && parsed.body.sessions[0]?.exercises[0]?.sets[0]).toMatchObject({
      durationSeconds: 1_230,
      met: 7.5,
      repsMin: null,
      loadKind: null,
    });
  });

  it('dice dónde está lo que no se puede guardar, sin repetir', () => {
    const [base] = newExerciseDraft({ id: ROW, name: 'Remo' }).sets;
    if (!base) throw new Error('Un ejercicio nuevo tiene series.');
    const parsed = weekBodyOf({
      ...emptyWeek([
        { ...newSessionDraft(1), name: ' ' },
        {
          ...newSessionDraft(2),
          exercises: [
            {
              ...newExerciseDraft({ id: ROW, name: 'Remo' }),
              sets: [
                { ...base, repsMin: 'ocho' },
                { ...base, loadKind: 'KG', loadValue: '62,555' },
              ],
            },
            { ...newExerciseDraft({ id: ROW, name: 'Remo' }), sets: [] },
          ],
        },
      ]),
      volumeFactor: 'mucho',
    });

    expect(!parsed.ok && parsed.problems).toEqual([
      'Semana: revisa el factor de volumen.',
      'Sesión 1: revisa el nombre.',
      'Sesión 2, ejercicio 1, serie 1: revisa las repeticiones mínimas.',
      'Sesión 2, ejercicio 1, serie 2: revisa el valor de la carga.',
      'Sesión 2, ejercicio 2: revisa las series.',
    ]);
  });

  it('más sesiones de las que caben es un problema de la semana', () => {
    const parsed = weekBodyOf(
      emptyWeek(Array.from({ length: 15 }, (_, index) => newSessionDraft(index + 1))),
    );

    expect(!parsed.ok && parsed.problems).toEqual(['Semana: revisa las sesiones.']);
  });

  it('sabe si cambió algo, sin mirar las claves de React', () => {
    const saved = weekDraftOf(week([session()]));

    expect(sameDraft(saved, weekDraftOf(week([session()])))).toBe(true);
    expect(sameDraft(saved, { ...saved, phaseEs: 'Base' })).toBe(false);
  });

  it('agrega una serie igual a la última; sin series, parte de la base', () => {
    const [first] = weekDraftOf(week([session()])).sessions[0]?.exercises[0]?.sets ?? [];
    if (!first) throw new Error('La fila tiene una serie.');
    const copy = nextSet([{ ...first, repsMin: '6' }]);

    expect(copy).toMatchObject({ repsMin: '6', repsMax: '12' });
    expect(copy.key).not.toBe(first.key);
    expect(nextSet([])).toMatchObject({ repsMin: '8', loadKind: 'RIR', loadValue: '2' });
  });

  it('cambia, quita y mueve filas sin tocar las demás', () => {
    expect(replaceAt(['a', 'b'], 1, 'c')).toEqual(['a', 'c']);
    expect(removeAt(['a', 'b'], 0)).toEqual(['b']);
    expect(moveAt(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveAt(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveAt(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveAt(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('lo que se ve de un ejercicio sin abrirlo', () => {
  const [base] = newExerciseDraft({ id: ROW, name: 'Remo' }).sets;
  if (!base) throw new Error('Un ejercicio nuevo tiene series.');
  const one = (changes: object) => [{ ...base, ...changes }];

  it('resume series iguales con sus repeticiones, su carga y su descanso', () => {
    expect(setsSummary([])).toBe('Sin series');
    expect(setsSummary(one({}))).toBe('1 serie · 8 a 12 rep · RIR 2 · 90 s');
    expect(setsSummary(one({ repsMin: '5', repsMax: '5', loadKind: 'KG', loadValue: '60' }))).toBe(
      '1 serie · 5 rep · 60 kg · 90 s',
    );
    expect(setsSummary(one({ loadKind: 'PCT_1RM', loadValue: '80', restSeconds: '' }))).toBe(
      '1 serie · 8 a 12 rep · 80 % de 1RM',
    );
    expect(setsSummary(one({ loadKind: 'BODYWEIGHT', loadValue: '', repsMax: '' }))).toBe(
      '1 serie · 8 rep · Peso corporal · 90 s',
    );
    expect(setsSummary(one({ repsMin: '', repsMax: '', loadKind: 'NONE', minutes: '20' }))).toBe(
      '1 serie · 20 min · 90 s',
    );
  });

  it('si son distintas, lo dice', () => {
    expect(setsSummary([base, { ...base, key: 'otra', repsMin: '6' }])).toBe('2 series distintas');
  });

  it('dos series iguales no son distintas aunque tengan otra clave', () => {
    expect(setsSummary([base, { ...base, key: 'otra' }])).toBe(
      '2 series · 8 a 12 rep · RIR 2 · 90 s',
    );
  });

  it('dice la carga como se dice', () => {
    expect(loadText(null, '')).toBeNull();
    expect(loadText('NONE', '')).toBeNull();
    expect(loadText('RPE', '8')).toBe('RPE 8');
    expect(loadText('KG', '')).toBe('kg');
  });
});

describe('RN-F14 · los bloques de la propuesta', () => {
  const approvedAt = '2026-10-31T12:00:00.000Z';
  const pair = (first: Partial<Exercise>, second: Partial<Exercise>) =>
    documentOf([
      week([session({ exercises: [exercise(first)] })], 1),
      week([session({ exercises: [exercise(second)] })], 2),
    ]);

  it('un bloque aparece una vez, aunque se repita en las semanas, y ordenado por día y orden', () => {
    const document = documentOf([
      week([
        session({
          position: 2,
          name: 'Inferior',
          exercises: [exercise({ position: 2 }), exercise()],
        }),
        session({ position: 1, name: 'Superior' }),
      ]),
    ]);

    expect(proposalBlocks(document).map((b) => [b.day, b.order, b.dayName, b.weekNo])).toEqual([
      [1, 1, 'Superior', 1],
      [2, 1, 'Inferior', 1],
      [2, 2, 'Inferior', 1],
    ]);
  });

  it('queda aprobado solo si lo está en todas sus semanas', () => {
    expect(proposalBlocks(pair({ approvedAt }, { approvedAt }))[0]?.approved).toBe(true);
    expect(proposalBlocks(pair({ approvedAt }, {}))[0]?.approved).toBe(false);
    expect(proposalBlocks(pair({}, { approvedAt }))[0]?.approved).toBe(false);
  });

  it('dice si se sustituyó el ejercicio sugerido', () => {
    const substituted = { suggestedExerciseId: OTHER, approvedAt };
    expect(proposalBlocks(pair(substituted, substituted))[0]?.substituted).toBe(true);
    const same = { suggestedExerciseId: SQUAT };
    expect(proposalBlocks(pair(same, same))[0]?.substituted).toBe(false);
    expect(proposalBlocks(pair({}, {}))[0]?.substituted).toBe(false);
  });

  it('muestra lo que cambia en otras semanas: se aprueba lo que hay en cada una', () => {
    const remo = { exerciseId: ROW, name: 'Remo' };
    const document = documentOf([
      week([session()], 1),
      week([session({ exercises: [exercise(remo)] })], 2),
      week([session({ exercises: [exercise(remo)] })], 3),
      week([session({ exercises: [exercise({ exerciseId: OTHER, name: 'Prensa' })] })], 4),
      week([session()], 5),
    ]);

    expect(proposalBlocks(document)[0]?.otherExercises).toEqual([
      { name: 'Remo', weeks: [2, 3] },
      { name: 'Prensa', weeks: [4] },
    ]);
  });
});

describe('RF-26 · lo guardado conserva su clave', () => {
  it('dos lecturas de la misma semana dan las mismas claves: guardar no cierra lo abierto', () => {
    const first = weekDraftOf(week([session()]));
    const second = weekDraftOf(week([session()]));

    expect(second.sessions[0]?.key).toBe(first.sessions[0]?.key);
    expect(second.sessions[0]?.exercises[0]?.key).toBe(FILA);
    expect(second.sessions[0]?.exercises[0]?.sets[0]?.key).toBe(
      first.sessions[0]?.exercises[0]?.sets[0]?.key,
    );
  });
});

describe('las semanas de un mesociclo', () => {
  it('dice el rango, o la única que tiene', () => {
    expect(weekRange([{ weekNo: 1 }, { weekNo: 2 }, { weekNo: 4 }])).toBe('semanas 1 a 4');
    expect(weekRange([{ weekNo: 3 }])).toBe('semana 3');
    expect(weekRange([])).toBe('');
  });
});

describe('RN-F13 · la fase en pocas palabras', () => {
  it('dice lo que tiene y omite lo que falta', () => {
    expect(phaseSummary(week([]))).toEqual([]);
    expect(
      phaseSummary({
        ...week([]),
        isDeload: true,
        phaseEs: 'Hipertrofia',
        phaseGoalEs: 'Sobrecarga',
        volumeFactor: 1.1,
        intensity: 'MODERATE_HIGH',
        targetRir: 1,
        reviewKind: 'CONTROL',
      }),
    ).toEqual([
      'Descarga',
      'Hipertrofia',
      'Sobrecarga',
      'Volumen × 1.1',
      'Intensidad moderada-alta',
      'RIR 1',
      'Control y ajuste',
    ]);
  });
});

describe('RN-F13 · una semana de descarga', () => {
  it('no lo dice dos veces si la fase ya se llama así', () => {
    expect(phaseSummary({ ...week([]), isDeload: true, phaseEs: 'Descarga' })).toEqual([
      'Descarga',
    ]);
  });
});

describe('RN-F06 · las series de la semana por grupo muscular', () => {
  it('suma lo que da la API por sesión, de mayor a menor', () => {
    const totals = weekSetsByMuscle(
      week([
        session({ setsByMuscle: { GLUTES: 1.5, QUADRICEPS: 3 } }),
        session({ position: 2, setsByMuscle: { GLUTES: 3, CHEST: 3 } }),
      ]),
    );

    expect(totals).toEqual([
      ['GLUTES', 4.5],
      ['CHEST', 3],
      ['QUADRICEPS', 3],
    ]);
  });
});

describe('los nombres de lo que muestra el programa', () => {
  it('reúne los músculos del programa y sus semanas', () => {
    const document = documentOf([week([session()], 1), week([session()], 2)]);

    expect([...muscleNames(document)]).toEqual([
      ['QUADRICEPS', 'Cuádriceps'],
      ['GLUTES', 'Glúteo'],
    ]);
    expect(weeksOfDocument(document).map((w) => w.weekNo)).toEqual([1, 2]);
  });
});
