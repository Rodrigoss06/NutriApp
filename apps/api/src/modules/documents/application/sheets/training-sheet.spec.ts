import { describe, expect, it } from 'vitest';
import type { ProgramSnapshot } from '../../../training/index.js';
import {
  DEMO_TRAINING_SHEET,
  TRAINING_PATIENT,
  TRAINING_SNAPSHOT,
} from './sheet-fixtures.spec-support.js';
import { trainingSheet } from './training-sheet.js';

const sheet = DEMO_TRAINING_SHEET;

/** El snapshot con cada semana cambiada por `change`. */
const withWeeks = (
  change: (
    week: ProgramSnapshot['mesocycles'][number]['weeks'][number],
  ) => ProgramSnapshot['mesocycles'][number]['weeks'][number],
): ProgramSnapshot => ({
  ...TRAINING_SNAPSHOT,
  mesocycles: TRAINING_SNAPSHOT.mesocycles.map((mesocycle) => ({
    ...mesocycle,
    weeks: mesocycle.weeks.map(change),
  })),
});

describe('RN-H01 · RN-F12 · la ficha de la rutina sale de su snapshot', () => {
  it('trae el programa como se publicó, con su fórmula de 1RM y la versión de la tabla de fases', () => {
    expect(sheet.kind).toBe('TRAINING');
    expect(sheet.patient).toEqual(TRAINING_PATIENT);
    expect(sheet.program).toEqual({
      name: 'Macrociclo de hipertrofia',
      versionNo: 1,
      goal: 'Ganar masa muscular con buena técnica.',
      origin: 'PROPOSAL',
      objective: 'HYPERTROPHY',
      level: 'BEGINNER',
      daysPerWeek: 2,
      split: 'FULL_BODY',
      oneRmFormula: 'ONERM_EPLEY1985',
      startDate: '2026-11-02',
      endDate: '2026-12-27',
      totalWeeks: 8,
      periodizationValidFrom: '2026-10-15',
      engineVersion: '1.4.0',
    });
    expect(sheet.mesocycles).toEqual([
      { name: 'Mesociclo 1', focus: null, weeks: [1, 2, 3, 4, 5] },
      { name: 'Mesociclo 2', focus: null, weeks: [6, 7, 8] },
    ]);
  });

  it('RN-F13: el macrociclo, semana por semana; sin fases, no hay macrociclo', () => {
    expect(sheet.macrocycle).toHaveLength(8);
    expect(sheet.macrocycle[4]).toEqual({
      weekNo: 5,
      isDeload: true,
      phase: 'Descarga',
      phaseGoal: 'Disipar fatiga',
      volumeFactor: 0.65,
      intensity: 'LOW_MODERATE',
      targetRir: 4,
      reviewKind: 'DAILY',
    });

    const manual = trainingSheet(
      withWeeks((week) => ({
        ...week,
        isDeload: false,
        phaseEs: null,
        phaseGoalEs: null,
        volumeFactor: null,
        intensity: null,
        targetRir: null,
        reviewKind: null,
      })),
      TRAINING_PATIENT,
    );
    expect(manual.macrocycle).toEqual([]);
  });

  it('RN-F06 · RN-H04: las series por grupo muscular llevan su método', () => {
    expect(sheet.methods).toEqual([{ methodCode: 'FRACTIONAL_SETS', methodVersion: '1.0.0' }]);
  });
});

describe('ADR-079 · las semanas iguales se imprimen una vez', () => {
  it('07 §6 y §7: las semanas con las mismas series y el mismo RIR van juntas, en el orden en que aparecen', () => {
    expect(sheet.blocks.map((block) => block.weeks)).toEqual([[1], [2, 6], [3, 7], [4, 8], [5]]);
  });

  it('cada sesión con su orden, sus notas y sus ejercicios con sus series', () => {
    const [first] = sheet.blocks;
    expect(
      first?.sessions.map((session) => [session.position, session.dayOfWeek, session.name]),
    ).toEqual([
      [1, null, 'Cuerpo completo A'],
      [2, null, 'Cuerpo completo B'],
    ]);
    const [a] = first?.sessions ?? [];
    expect(a?.notes).toBe('Calienta 10 minutos antes de empezar.');
    expect(
      a?.exercises.map((exercise) => [exercise.name, exercise.notes, exercise.sets.length]),
    ).toEqual([
      ['Sentadilla goblet', 'Baja controlado y sin rebotar.', 2],
      ['Flexión de brazos inclinada', null, 3],
    ]);
    expect(a?.exercises[0]?.sets[0]).toEqual({
      setNo: 1,
      setType: 'WORKING',
      repsMin: 8,
      repsMax: 12,
      loadKind: 'RIR',
      loadValue: 3,
      restSeconds: 90,
      tempo: '2-1-2',
      durationSeconds: null,
      distanceM: null,
      met: null,
    });
  });

  it('RN-F06: las series de la semana por grupo muscular, por nombre y de mayor a menor', () => {
    expect(sheet.blocks[0]?.setsByMuscle).toEqual([
      { muscle: 'Cuádriceps', sets: 2 },
      { muscle: 'Glúteo', sets: 2 },
      { muscle: 'Isquiosurales', sets: 2 },
      { muscle: 'Pectoral', sets: 2 },
      { muscle: 'Cardiorrespiratorio', sets: 1 },
      { muscle: 'Tríceps', sets: 1 },
    ]);
    expect(sheet.blocks[1]?.setsByMuscle.map(({ muscle }) => muscle)).toEqual([
      'Cuádriceps',
      'Glúteo',
      'Isquiosurales',
      'Pectoral',
      'Tríceps',
      'Cardiorrespiratorio',
    ]);
  });

  it('dos semanas que se imprimen igual pero cuentan otros músculos no se juntan', () => {
    const changed = trainingSheet(
      withWeeks((week) =>
        week.weekNo === 6
          ? {
              ...week,
              sessions: week.sessions.map((session) =>
                session.position === 1
                  ? { ...session, setsByMuscle: { ...session.setsByMuscle, GLUTES: 3 } }
                  : session,
              ),
            }
          : week,
      ),
      TRAINING_PATIENT,
    );

    expect(changed.blocks.map((block) => block.weeks)).toEqual([
      [1],
      [2],
      [3, 7],
      [4, 8],
      [5],
      [6],
    ]);
  });
});

describe('RN-F11 · cada ejercicio una vez, con sus músculos, su precaución y sus variantes', () => {
  it('en el orden en que aparece, con lo que congeló el snapshot', () => {
    expect(sheet.exercises).toEqual([
      {
        name: 'Sentadilla goblet',
        primaryMuscles: ['Cuádriceps'],
        secondaryMuscles: ['Glúteo'],
        caution: 'Dolor de rodilla o lumbar',
        alternative: 'Sentarse y levantarse',
        easierVariant: 'Sentadilla a caja',
        harderVariant: 'Prensa de piernas',
      },
      {
        name: 'Flexión de brazos inclinada',
        primaryMuscles: ['Pectoral'],
        secondaryMuscles: ['Tríceps'],
        caution: 'Dolor de hombro',
        alternative: null,
        easierVariant: 'Flexión de brazos en pared',
        harderVariant: 'Flexión de brazos',
      },
      {
        name: 'Peso muerto rumano con mancuernas',
        primaryMuscles: ['Isquiosurales'],
        secondaryMuscles: ['Glúteo'],
        caution: 'Dolor lumbar',
        alternative: null,
        easierVariant: null,
        harderVariant: null,
      },
      {
        name: 'Caminata inclinada',
        primaryMuscles: ['Cardiorrespiratorio'],
        secondaryMuscles: [],
        caution: 'Síntomas cardiovasculares',
        alternative: null,
        easierVariant: null,
        harderVariant: null,
      },
    ]);
  });
});

describe('ADR-079 · lo que es de la aprobación no va en la ficha', () => {
  it('ni la nota de la sustitución, ni quién aprobó, ni los ids', () => {
    const text = JSON.stringify(sheet);

    expect(text).not.toContain('Le molesta el hombro');
    expect(text).not.toContain('approved');
    expect(text).not.toContain('suggested');
    expect(text).not.toContain(TRAINING_SNAPSHOT.programId);
    expect(text).not.toContain(TRAINING_SNAPSHOT.publishedBy);
  });
});

describe('RN-H02 · la misma rutina da el mismo contenido', () => {
  it('dos veces con el mismo snapshot: lo mismo, porque nada depende del día en que se genera', () => {
    expect(trainingSheet(TRAINING_SNAPSHOT, TRAINING_PATIENT)).toEqual(sheet);
  });
});
