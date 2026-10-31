import { ENGINE_VERSION } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import type { ExerciseRecord } from '../../exercise/index.js';
import type { Mesocycle, PrescribedSet } from '../domain/program.js';
import { programDocument, programSnapshot } from './program-document.js';

const SET: PrescribedSet = {
  setNo: 1,
  setType: 'WORKING',
  repsMin: 8,
  repsMax: 12,
  loadKind: 'KG',
  loadValue: 100,
  restSeconds: 90,
  tempo: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
};

const exercise = (id: string, changes: Partial<ExerciseRecord> = {}) =>
  ({
    id,
    name: `Ejercicio ${id}`,
    pattern: 'SQUAT',
    primaryMuscles: [],
    secondaryMuscles: [],
    caution: null,
    alternative: null,
    easierVariant: null,
    harderVariant: null,
    mediaUrl: null,
    instructions: null,
    ...changes,
  }) as unknown as ExerciseRecord;

// La sesión de G-24: sentadilla 3 series y press de banca 2.
const SQUAT = exercise('sentadilla', {
  primaryMuscles: [
    { code: 'QUADRICEPS', name: 'Cuádriceps' },
    { code: 'GLUTES', name: 'Glúteo' },
  ],
  secondaryMuscles: [{ code: 'HAMSTRINGS', name: 'Isquiosurales' }],
  caution: 'Dolor de rodilla',
  easierVariant: { id: 'goblet', name: 'Sentadilla goblet' },
});
const BENCH = exercise('press', {
  name: 'Press de banca',
  primaryMuscles: [{ code: 'CHEST', name: 'Pectoral' }],
  secondaryMuscles: [
    { code: 'TRICEPS', name: 'Tríceps' },
    { code: 'FRONT_DELTOID', name: 'Deltoides anterior' },
  ],
});

const approvedAt = new Date('2026-10-31T12:00:00.000Z');
const mesocycles: readonly Mesocycle[] = [
  {
    id: 'meso',
    position: 1,
    name: 'Base',
    focus: null,
    weeks: [
      {
        id: 'semana',
        weekNo: 1,
        isDeload: false,
        phaseEs: null,
        phaseGoalEs: null,
        volumeFactor: null,
        intensity: null,
        targetRir: null,
        reviewKind: null,
        sessions: [
          {
            id: 'sesion',
            position: 1,
            name: 'Sesión 1',
            dayOfWeek: 2,
            notes: null,
            exercises: [
              {
                id: 'fila-1',
                exerciseId: 'sentadilla',
                position: 1,
                supersetGroup: null,
                notes: null,
                movementPattern: 'SQUAT',
                suggestedExerciseId: 'sentadilla',
                substitutionNote: null,
                approvedBy: 'coach',
                approvedAt,
                sets: [
                  { ...SET, setType: 'WARMUP' },
                  { ...SET, setNo: 2 },
                  { ...SET, setNo: 3 },
                  { ...SET, setNo: 4 },
                ],
              },
              {
                id: 'fila-2',
                exerciseId: 'press',
                position: 2,
                supersetGroup: null,
                notes: null,
                movementPattern: null,
                suggestedExerciseId: null,
                substitutionNote: null,
                approvedBy: null,
                approvedAt: null,
                sets: [SET, { ...SET, setNo: 2 }],
              },
            ],
          },
        ],
      },
    ],
  },
];

describe('RN-F06 · las series por músculo de cada sesión', () => {
  it('G-24: principal 1 y secundario 0.5, sin el calentamiento, con su método', () => {
    const document = programDocument(mesocycles, [SQUAT, BENCH]);
    const session = document.mesocycles[0]?.weeks[0]?.sessions[0];

    expect(session?.setsByMuscle).toEqual({
      QUADRICEPS: 3,
      GLUTES: 3,
      HAMSTRINGS: 1.5,
      CHEST: 2,
      TRICEPS: 1,
      FRONT_DELTOID: 1,
    });
    expect(document.setsMethod).toMatchObject({ code: 'FRACTIONAL_SETS' });
    expect(document.totalWeeks).toBe(1);
  });
});

describe('RN-F12 · lo que congela publicar', () => {
  const document = programDocument(mesocycles, [SQUAT, BENCH]);
  const meta = {
    programId: 'programa',
    lineageId: 'linaje',
    versionNo: 1,
    patientId: 'paciente',
    name: 'Rutina',
    goal: null,
    origin: 'MANUAL',
    oneRmFormula: 'ONERM_EPLEY1985',
    objective: null,
    level: null,
    daysPerWeek: null,
    split: null,
    macrocycleWeeks: null,
    periodizationValidFrom: null,
    templateVersion: null,
    athleteProfileId: null,
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    publishedAt: '2026-10-31T12:00:00.000Z',
    publishedBy: 'coach',
  } as const;

  it('RN-F11: cada ejercicio lleva sus músculos, su precaución y sus variantes, y la aprobación como texto', () => {
    const row = document.mesocycles[0]?.weeks[0]?.sessions[0]?.exercises[0];

    expect(row).toMatchObject({
      name: 'Ejercicio sentadilla',
      pattern: 'SQUAT',
      primaryMuscles: SQUAT.primaryMuscles,
      secondaryMuscles: SQUAT.secondaryMuscles,
      caution: 'Dolor de rodilla',
      easierVariant: { id: 'goblet', name: 'Sentadilla goblet' },
      approvedAt: '2026-10-31T12:00:00.000Z',
    });
    expect(document.mesocycles[0]?.weeks[0]?.sessions[0]?.exercises[1]?.approvedAt).toBeNull();
  });

  it('el snapshot lleva su versión, la del motor y el calendario para tracking', () => {
    const { snapshot } = programSnapshot(document, meta);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      programId: 'programa',
      totalWeeks: 1,
      schedule: {
        weeks: [
          {
            weekNo: 1,
            sessions: [{ position: 1, dayOfWeek: 2, setsByMuscle: { CHEST: 2 } }],
          },
        ],
      },
    });
  });

  it('RN-H02: el mismo contenido da el mismo hash, y otro contenido, otro', () => {
    const { hash } = programSnapshot(document, meta);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(programSnapshot(document, meta).hash).toBe(hash);
    expect(programSnapshot(document, { ...meta, name: 'Otra' }).hash).not.toBe(hash);
  });

  it('un ejercicio que no está en la biblioteca es un error, no un programa a medias', () => {
    expect(() => programDocument(mesocycles, [SQUAT])).toThrow(/press/);
  });
});
