import { describe, expect, it } from 'vitest';
import { trainingTargetOf, type ProgramCalendar } from './active-program.js';

const SESSION_1 = { position: 1, dayOfWeek: null, setsByMuscle: { QUADRICEPS: 3, GLUTES: 1.5 } };
const SESSION_2 = { position: 2, dayOfWeek: null, setsByMuscle: { QUADRICEPS: 1, CHEST: 3 } };
const CALENDAR: ProgramCalendar = {
  // Lunes.
  startDate: '2026-11-02',
  weeks: [
    { weekNo: 1, sessions: [SESSION_1, SESSION_2] },
    { weekNo: 2, sessions: [SESSION_2] },
  ],
};

describe('RN-G03 · 07 §8 · la meta de entrenamiento de cada día', () => {
  it('los días 1 a N son las sesiones 1 a N', () => {
    expect(trainingTargetOf(CALENDAR, '2026-11-02')).toEqual({
      plannedSessions: 1,
      plannedSets: { QUADRICEPS: 3, GLUTES: 1.5 },
    });
    expect(trainingTargetOf(CALENDAR, '2026-11-03')).toEqual({
      plannedSessions: 1,
      plannedSets: { QUADRICEPS: 1, CHEST: 3 },
    });
  });

  it('los demás días son de descanso: la meta es no entrenar, no la falta de meta', () => {
    expect(trainingTargetOf(CALENDAR, '2026-11-04')).toEqual({
      plannedSessions: 0,
      plannedSets: {},
    });
    expect(trainingTargetOf(CALENDAR, '2026-11-08')).toEqual({
      plannedSessions: 0,
      plannedSets: {},
    });
  });

  it('cada semana empieza de nuevo', () => {
    // La semana 2 solo tiene la sesión 2: su primer día es de descanso y el segundo, de entrenamiento.
    expect(trainingTargetOf(CALENDAR, '2026-11-09')?.plannedSessions).toBe(0);
    expect(trainingTargetOf(CALENDAR, '2026-11-10')?.plannedSets).toEqual({
      QUADRICEPS: 1,
      CHEST: 3,
    });
  });

  it('antes y después del programa no hay meta', () => {
    expect(trainingTargetOf(CALENDAR, '2026-11-01')).toBeNull();
    expect(trainingTargetOf(CALENDAR, '2026-11-15')).toEqual({
      plannedSessions: 0,
      plannedSets: {},
    });
    expect(trainingTargetOf(CALENDAR, '2026-11-16')).toBeNull();
  });

  it('una sesión con su día de la semana va ese día, y dos el mismo día se suman', () => {
    const calendar: ProgramCalendar = {
      startDate: '2026-11-02',
      weeks: [
        {
          weekNo: 1,
          sessions: [
            { ...SESSION_1, dayOfWeek: 5 },
            { ...SESSION_2, dayOfWeek: 5 },
          ],
        },
      ],
    };

    // El viernes es 5; el lunes, primer día, ya no es la sesión 1.
    expect(trainingTargetOf(calendar, '2026-11-02')?.plannedSessions).toBe(0);
    expect(trainingTargetOf(calendar, '2026-11-06')).toEqual({
      plannedSessions: 2,
      plannedSets: { QUADRICEPS: 4, GLUTES: 1.5, CHEST: 3 },
    });
    // El domingo es 7.
    expect(
      trainingTargetOf(
        {
          startDate: '2026-11-02',
          weeks: [{ weekNo: 1, sessions: [{ ...SESSION_1, dayOfWeek: 7 }] }],
        },
        '2026-11-08',
      )?.plannedSessions,
    ).toBe(1);
  });
});
