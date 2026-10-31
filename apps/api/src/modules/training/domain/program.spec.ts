import { describe, expect, it } from 'vitest';
import {
  copyMesocycles,
  copySessions,
  endDateOf,
  exerciseIdsOf,
  programProblems,
  sessionsFrom,
  sessionsProblems,
  type Mesocycle,
  type PrescribedExercise,
  type PrescribedSet,
  type ProgramSession,
  type ProgramWeek,
} from './program.js';

const SET: PrescribedSet = {
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
const exercise = (changes: Partial<PrescribedExercise> = {}): PrescribedExercise => ({
  id: 'fila-1',
  exerciseId: 'sentadilla',
  position: 1,
  supersetGroup: null,
  notes: null,
  movementPattern: null,
  suggestedExerciseId: null,
  substitutionNote: null,
  approvedBy: null,
  approvedAt: null,
  sets: [SET],
  ...changes,
});
const session = (changes: Partial<ProgramSession> = {}): ProgramSession => ({
  id: 'sesion-1',
  position: 1,
  name: 'Sesión 1',
  dayOfWeek: null,
  notes: null,
  exercises: [exercise()],
  ...changes,
});
const week = (weekNo: number, sessions: readonly ProgramSession[] = [session()]): ProgramWeek => ({
  id: `semana-${String(weekNo)}`,
  weekNo,
  isDeload: false,
  phaseEs: null,
  phaseGoalEs: null,
  volumeFactor: null,
  intensity: null,
  targetRir: null,
  reviewKind: null,
  sessions,
});
const mesocycle = (weeks: readonly ProgramWeek[]): Mesocycle => ({
  id: 'meso-1',
  position: 1,
  name: 'Mesociclo 1',
  focus: null,
  weeks,
});
const problemsOfSet = (changes: Partial<PrescribedSet>) =>
  sessionsProblems([session({ exercises: [exercise({ sets: [{ ...SET, ...changes }] })] })]);
const counter = () => {
  let next = 0;
  return () => `nuevo-${String((next += 1))}`;
};

describe('02 §7 · lo que una serie no puede ser', () => {
  it('una serie de la propuesta está bien', () => {
    expect(problemsOfSet({})).toEqual([]);
  });

  it('las repeticiones mínimas no son mayores que las máximas, y dice dónde', () => {
    expect(problemsOfSet({ repsMin: 12, repsMax: 8 })).toEqual([
      'Sesión 1, ejercicio 1, serie 1: las repeticiones mínimas son mayores que las máximas.',
    ]);
  });

  it('una sola forma de carga: con su valor, salvo el peso corporal', () => {
    expect(problemsOfSet({ loadKind: null, loadValue: 50 })[0]).toContain('forma de la carga');
    expect(problemsOfSet({ loadKind: 'KG', loadValue: null })[0]).toContain('valor de la carga');
    expect(problemsOfSet({ loadKind: 'BODYWEIGHT', loadValue: 10 })[0]).toContain('peso corporal');
    expect(problemsOfSet({ loadKind: 'BODYWEIGHT', loadValue: null })).toEqual([]);
    expect(problemsOfSet({ loadKind: null, loadValue: null })).toEqual([]);
  });

  it('RN-F05: RPE y RIR van de 0 a 10; el % de 1RM, hasta 100', () => {
    expect(problemsOfSet({ loadKind: 'RPE', loadValue: 11 })[0]).toContain('RPE va de 0 a 10');
    expect(problemsOfSet({ loadKind: 'RIR', loadValue: 11 })[0]).toContain('RIR va de 0 a 10');
    expect(problemsOfSet({ loadKind: 'RPE', loadValue: 10 })).toEqual([]);
    expect(problemsOfSet({ loadKind: 'PCT_1RM', loadValue: 101 })[0]).toContain('hasta 100');
    expect(problemsOfSet({ loadKind: 'PCT_1RM', loadValue: 80 })).toEqual([]);
  });

  it('RN-F10: el cardio va en duración, con sus MET; una serie tiene algo que hacer', () => {
    const cardio = { repsMin: null, repsMax: null, loadKind: null, loadValue: null };
    expect(problemsOfSet({ ...cardio, durationSeconds: 1_200, met: 7 })).toEqual([]);
    expect(problemsOfSet({ ...cardio, distanceM: 400 })).toEqual([]);
    expect(problemsOfSet({ ...cardio })[0]).toContain('repeticiones, duración o distancia');
    expect(problemsOfSet({ met: 7 })[0]).toContain('con una duración');
  });
});

describe('RN-F12 · RN-F14 · lo que falta para publicar', () => {
  it('sin mesociclos no hay programa', () => {
    expect(programProblems({ origin: 'MANUAL', mesocycles: [] })).toEqual([
      'Agrega al menos un mesociclo.',
    ]);
  });

  it('dice qué semana no tiene sesiones y qué sesión no tiene ejercicios', () => {
    const problems = programProblems({
      origin: 'MANUAL',
      mesocycles: [mesocycle([week(1), week(2, []), week(3, [session({ exercises: [] })])])],
    });

    expect(problems).toEqual([
      'La semana 2 no tiene sesiones.',
      'Semana 3, Sesión 1: no tiene ejercicios.',
    ]);
  });

  it('a mano se publica sin aprobar', () => {
    expect(programProblems({ origin: 'MANUAL', mesocycles: [mesocycle([week(1)])] })).toEqual([]);
  });

  it('una propuesta pide cada bloque aprobado, contado una vez aunque se repita en las semanas', () => {
    const pending = session({ exercises: [exercise(), exercise({ id: 'fila-2', position: 2 })] });
    expect(
      programProblems({
        origin: 'PROPOSAL',
        mesocycles: [mesocycle([week(1, [pending]), week(2, [pending])])],
      }),
    ).toEqual(['Faltan 2 ejercicios por aprobar.']);

    const approved = exercise({ approvedAt: new Date('2026-10-31'), approvedBy: 'coach' });
    const onePending = session({ exercises: [approved, exercise({ id: 'fila-2', position: 2 })] });
    expect(
      programProblems({ origin: 'PROPOSAL', mesocycles: [mesocycle([week(1, [onePending])])] }),
    ).toEqual(['Falta 1 ejercicio por aprobar.']);

    expect(
      programProblems({
        origin: 'PROPOSAL',
        mesocycles: [mesocycle([week(1, [session({ exercises: [approved] })])])],
      }),
    ).toEqual([]);
  });
});

describe('RF-26 · duplicar y versionar copian sin compartir filas', () => {
  it('duplicar una semana da ids nuevos y conserva lo demás', () => {
    const [copy] = copySessions([session()], counter());

    expect(copy).toMatchObject({ id: 'nuevo-1', name: 'Sesión 1', position: 1 });
    expect(copy?.exercises[0]).toMatchObject({
      id: 'nuevo-2',
      exerciseId: 'sentadilla',
      sets: [SET],
    });
  });

  it('la versión siguiente copia toda la estructura con su fase', () => {
    const original = mesocycle([{ ...week(1), phaseEs: 'Adaptación', volumeFactor: 0.75 }]);

    const [copy] = copyMesocycles([original], counter());

    expect(copy?.id).toBe('nuevo-1');
    expect(copy?.weeks[0]).toMatchObject({
      id: 'nuevo-2',
      weekNo: 1,
      phaseEs: 'Adaptación',
      volumeFactor: 0.75,
    });
    expect(copy?.weeks[0]?.sessions[0]?.id).toBe('nuevo-3');
    expect(copy?.weeks[0]?.sessions[0]?.exercises[0]?.id).toBe('nuevo-4');
  });

  it('lista cada ejercicio una vez', () => {
    const two = session({ exercises: [exercise(), exercise({ id: 'b', exerciseId: 'remo' })] });

    expect(exerciseIdsOf([mesocycle([week(1, [two]), week(2, [two])])])).toEqual([
      'sentadilla',
      'remo',
    ]);
  });

  it('la última fecha cuenta las semanas desde el inicio', () => {
    expect(endDateOf('2026-11-02', 4)).toBe('2026-11-29');
    expect(endDateOf('2026-12-28', 1)).toBe('2027-01-03');
  });
});

describe('RN-F14 · lo que manda el coach sobre lo que había', () => {
  const approvedAt = new Date('2026-10-31T12:00:00Z');
  const block = exercise({
    id: 'bloque',
    movementPattern: 'SQUAT',
    suggestedExerciseId: 'sentadilla',
    substitutionNote: 'Va bien',
    approvedBy: 'coach',
    approvedAt,
  });
  const inputOf = (changes: object = {}) => ({
    name: 'Día 1',
    dayOfWeek: 2,
    notes: null,
    exercises: [
      {
        id: 'bloque',
        exerciseId: 'sentadilla',
        supersetGroup: null,
        notes: null,
        sets: [{ ...SET, setNo: undefined }, SET],
        ...changes,
      },
    ],
  });

  it('el mismo ejercicio conserva su fila, su patrón y su aprobación; numera sesiones y series', () => {
    const [result] = sessionsFrom([inputOf()], [session({ exercises: [block] })], counter());

    expect(result).toMatchObject({ id: 'nuevo-1', position: 1, name: 'Día 1', dayOfWeek: 2 });
    expect(result?.exercises[0]).toMatchObject({
      id: 'bloque',
      position: 1,
      movementPattern: 'SQUAT',
      suggestedExerciseId: 'sentadilla',
      substitutionNote: 'Va bien',
      approvedBy: 'coach',
      approvedAt,
    });
    expect(result?.exercises[0]?.sets.map((set) => set.setNo)).toEqual([1, 2]);
  });

  it('otro ejercicio conserva el bloque y pierde la aprobación: hay que volver a aprobarlo', () => {
    const [result] = sessionsFrom(
      [inputOf({ exerciseId: 'prensa' })],
      [session({ exercises: [block] })],
      counter(),
    );

    expect(result?.exercises[0]).toMatchObject({
      id: 'bloque',
      exerciseId: 'prensa',
      movementPattern: 'SQUAT',
      suggestedExerciseId: 'sentadilla',
      substitutionNote: null,
      approvedBy: null,
      approvedAt: null,
    });
  });

  it('una fila nueva, o un id que no era de esta semana, no trae nada de la propuesta', () => {
    const [result] = sessionsFrom(
      [inputOf({ id: null }), inputOf({ id: 'de-otra-semana' })],
      [session({ exercises: [block] })],
      counter(),
    );

    expect(result?.exercises[0]).toMatchObject({ id: 'nuevo-2', approvedAt: null });
    expect(result?.exercises[0]?.movementPattern).toBeNull();
  });

  it('un id repetido no duplica la fila', () => {
    const result = sessionsFrom(
      [
        {
          name: 'Día 1',
          dayOfWeek: null,
          notes: null,
          exercises: [...inputOf().exercises, ...inputOf().exercises],
        },
      ],
      [session({ exercises: [block] })],
      counter(),
    );

    const ids = result[0]?.exercises.map((row) => row.id);
    expect(new Set(ids).size).toBe(2);
    expect(result[0]?.exercises[1]?.approvedAt).toBeNull();
  });
});
