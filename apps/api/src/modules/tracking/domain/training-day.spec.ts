import { describe, expect, it } from 'vitest';
import {
  dayPerformance,
  locateSession,
  loggableSets,
  musclesOf,
  plannedTonnageKg,
  programDayOn,
  sessionView,
  type SnapshotProgram,
  type SnapshotSession,
} from './training-day.js';

const SET = {
  setNo: 1,
  setType: 'WORKING' as const,
  repsMin: 8,
  repsMax: 8,
  loadKind: 'KG' as const,
  loadValue: 60,
  restSeconds: 90,
  tempo: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
};

/** Con lo que trae el snapshot de verdad, como la nota de la sustitución, que la vista no debe mostrar. */
const SNAPSHOT_SESSION = {
  id: 'session-1',
  position: 1,
  name: 'Superior',
  dayOfWeek: null,
  notes: 'Calienta 10 minutos.',
  exercises: [
    {
      id: 'pe-1',
      exerciseId: 'squat',
      position: 1,
      name: 'Sentadilla goblet',
      supersetGroup: null,
      notes: 'Baja controlado.',
      substitutionNote: 'Le molesta el hombro',
      caution: 'Dolor de rodilla',
      alternative: { id: 'sit', name: 'Sentarse y levantarse' },
      easierVariant: { id: 'box', name: 'Sentadilla a caja' },
      harderVariant: null,
      mediaUrl: null,
      instructions: null,
      primaryMuscles: [{ code: 'QUADRICEPS', name: 'Cuádriceps' }],
      secondaryMuscles: [{ code: 'GLUTES', name: 'Glúteo' }],
      sets: [SET, { ...SET, setNo: 2 }, { ...SET, setNo: 3, setType: 'WARMUP' as const }],
    },
  ],
};
const SESSION: SnapshotSession = SNAPSHOT_SESSION;

describe('RN-F11 · ADR-079 · la sesión del día como la ve el paciente', () => {
  it('con las notas de la sesión y del ejercicio, sus variantes y su precaución; sin la nota de la sustitución', () => {
    const view = sessionView(SESSION);

    expect(view).toMatchObject({
      id: 'session-1',
      name: 'Superior',
      notes: 'Calienta 10 minutos.',
      exercises: [
        {
          id: 'pe-1',
          exerciseId: 'squat',
          name: 'Sentadilla goblet',
          notes: 'Baja controlado.',
          caution: 'Dolor de rodilla',
          alternative: 'Sentarse y levantarse',
          easierVariant: 'Sentadilla a caja',
          harderVariant: null,
          primaryMuscles: ['Cuádriceps'],
          secondaryMuscles: ['Glúteo'],
        },
      ],
    });
    expect(JSON.stringify(view)).not.toContain('Le molesta el hombro');
  });
});

describe('P-09 · ADR-080 · el tonelaje planificado de la sesión', () => {
  it('RN-F03: kg × repeticiones fijas de las series efectivas, sin el calentamiento', () => {
    expect(plannedTonnageKg(SESSION)).toBe(960);
  });

  it('con RIR o un rango de repeticiones no se puede calcular: sin dato', () => {
    const withRange = {
      ...SESSION,
      exercises: SESSION.exercises.map((e) => ({ ...e, sets: [{ ...SET, repsMax: 12 }] })),
    };
    const withRir = {
      ...SESSION,
      exercises: SESSION.exercises.map((e) => ({
        ...e,
        sets: [{ ...SET, loadKind: 'RIR' as const, loadValue: 2 }],
      })),
    };
    expect(plannedTonnageKg(withRange)).toBeNull();
    expect(plannedTonnageKg(withRir)).toBeNull();
  });
});

describe('RN-F06 · los músculos de cada serie se congelan al registrarla', () => {
  it('el principal cuenta 1 y el secundario 0.5', () => {
    const [squat] = SESSION.exercises;
    expect(squat && musclesOf(squat)).toEqual([
      { muscle: 'QUADRICEPS', weight: 1 },
      { muscle: 'GLUTES', weight: 0.5 },
    ]);
  });
});

const PROGRAM: SnapshotProgram = {
  programId: 'program-1',
  name: 'Fuerza base',
  startDate: '2026-11-02',
  mesocycles: [
    {
      id: 'meso-1',
      weeks: [
        {
          id: 'week-1',
          weekNo: 1,
          isDeload: false,
          phaseEs: 'Acumulación',
          targetRir: 3,
          sessions: [SESSION, { ...SESSION, id: 'session-2', position: 2, name: 'Inferior' }],
        },
      ],
    },
    {
      id: 'meso-2',
      weeks: [
        {
          id: 'week-2',
          weekNo: 2,
          isDeload: true,
          phaseEs: 'Descarga',
          targetRir: 4,
          sessions: [{ ...SESSION, id: 'session-3' }],
        },
      ],
    },
  ],
};

describe('07 §8 · la semana y la sesión del programa vigente', () => {
  it('una sesión se ubica en su semana y su mesociclo, aunque se haga otro día', () => {
    expect(locateSession(PROGRAM, 'session-3')).toMatchObject({
      mesocycleId: 'meso-2',
      week: { weekNo: 2, isDeload: true },
      session: { id: 'session-3' },
    });
    expect(locateSession(PROGRAM, 'otra')).toBeNull();
  });

  it('el día dice su semana y sus sesiones: los días 1 a N son las sesiones 1 a N', () => {
    expect(programDayOn(PROGRAM, '2026-11-03')).toMatchObject({
      mesocycleId: 'meso-1',
      week: { weekNo: 1, phaseEs: 'Acumulación', targetRir: 3 },
      sessions: [{ id: 'session-2' }],
    });
    expect(programDayOn(PROGRAM, '2026-11-09')).toMatchObject({
      mesocycleId: 'meso-2',
      sessions: [{ id: 'session-3' }],
    });
    expect(programDayOn(PROGRAM, '2026-11-05')?.sessions).toEqual([]);
    expect(programDayOn(PROGRAM, '2026-11-01')).toBeNull();
    expect(programDayOn(PROGRAM, '2026-11-16')).toBeNull();
  });
});

describe('RF-29 · RN-F06 · las series registradas, solo de ejercicios del programa', () => {
  const SETS = [
    { exerciseId: 'squat', setNo: 1 },
    { exerciseId: 'squat', setNo: 2 },
  ];

  it('cada serie lleva el nombre del ejercicio y sus músculos congelados', () => {
    expect(loggableSets([SESSION], SETS)).toEqual([
      {
        exerciseId: 'squat',
        setNo: 1,
        exerciseName: 'Sentadilla goblet',
        muscleContributions: [
          { muscle: 'QUADRICEPS', weight: 1 },
          { muscle: 'GLUTES', weight: 0.5 },
        ],
      },
      expect.objectContaining({ setNo: 2, exerciseName: 'Sentadilla goblet' }),
    ]);
  });

  it('un ejercicio que no está en la sesión no se registra', () => {
    expect(loggableSets([SESSION], [...SETS, { exerciseId: 'deadlift', setNo: 1 }])).toBeNull();
  });
});

describe('P-09 · ADR-080 · el rendimiento del día', () => {
  it('con tonelaje prescrito y registrado, el planificado y el real salen del entreno', () => {
    expect(
      dayPerformance({ plannedTonnageKg: 960, loggedTonnageKg: 1_008 }, { planned: 5, actual: 4 }),
    ).toEqual({ planned: 960, actual: 1_008, source: 'WORKOUT' });
  });

  it('sin tonelaje prescrito (RIR o rangos), vale lo que escribió el paciente', () => {
    expect(
      dayPerformance({ plannedTonnageKg: null, loggedTonnageKg: 900 }, { planned: 10, actual: 9 }),
    ).toEqual({ planned: 10, actual: 9, source: 'PATIENT' });
  });

  it('sin entreno registrado, también vale lo del paciente: nunca se mezclan las dos fuentes', () => {
    expect(
      dayPerformance(
        { plannedTonnageKg: 960, loggedTonnageKg: null },
        { planned: 10, actual: null },
      ),
    ).toEqual({ planned: 10, actual: null, source: 'PATIENT' });
  });

  it('sin ninguno de los dos no hay rendimiento y la indicación usa solo la recuperación', () => {
    expect(
      dayPerformance(
        { plannedTonnageKg: null, loggedTonnageKg: null },
        { planned: null, actual: null },
      ),
    ).toEqual({ planned: null, actual: null, source: null });
  });
});
