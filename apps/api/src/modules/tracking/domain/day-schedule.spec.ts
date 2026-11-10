import { describe, expect, it } from 'vitest';
import type { PlanTargets } from './active-plan.js';
import {
  dayOptions,
  dayProfileOf,
  sessionsOn,
  trainingTargetOf,
  type ProgramCalendar,
} from './active-program.js';
import type { DayChange } from './day-changes.js';
import {
  dayScheduleOf,
  profileChangeAllowed,
  profileChoicesOf,
  todayStepOf,
} from './day-schedule.js';

// Mateo (P-20.3): la sesión 1 va el lunes con Entrenamiento y la 2 el martes con un perfil Alto; el miércoles es de descanso.
const SESSION_1 = { position: 1, dayOfWeek: null, setsByMuscle: { QUADRICEPS: 3 } };
const SESSION_2 = {
  position: 2,
  dayOfWeek: null,
  dayProfileCode: 'HIGH',
  setsByMuscle: { CHEST: 3 },
};
const CALENDAR: ProgramCalendar = {
  // Lunes.
  startDate: '2026-11-02',
  weeks: [
    { weekNo: 1, sessions: [SESSION_1, SESSION_2] },
    { weekNo: 2, sessions: [SESSION_2] },
  ],
};
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';

const PLAN: PlanTargets = {
  targets: { kcal: 2_510, choG: 310, proteinG: 160, fatG: 70 },
  dayProfiles: [
    { code: 'REST', name: 'Descanso', kcal: 2_230, choG: 240, proteinG: 160, fatG: 70 },
    { code: 'HIGH', name: 'Alto', kcal: 2_750, choG: 370, proteinG: 160, fatG: 70 },
  ],
  hydrationTargetMl: 2_500,
};

let sequence = 0;
const change = (
  localDate: string,
  kind: DayChange['kind'],
  dayProfileCode: string | null = null,
): DayChange => {
  sequence += 1;
  return {
    id: `change-${String(sequence)}`,
    localDate,
    kind,
    dayProfileCode,
    createdAt: new Date(Date.UTC(2026, 10, 1, 12, 0, sequence)),
  };
};

describe('P-20.3 · «mover a mañana» lleva la sesión y su perfil al día siguiente (ADR-104)', () => {
  const moved = [change(TUESDAY, 'MOVED')];

  it('hoy queda de descanso y mañana trae la sesión, con su semana, sus series y su perfil', () => {
    expect(sessionsOn(CALENDAR, TUESDAY, moved)).toEqual({ weekNo: 1, sessions: [] });
    expect(sessionsOn(CALENDAR, WEDNESDAY, moved)).toEqual({ weekNo: 1, sessions: [SESSION_2] });
    expect(trainingTargetOf(CALENDAR, TUESDAY, moved)).toEqual({
      plannedSessions: 0,
      plannedSets: {},
    });
    expect(trainingTargetOf(CALENDAR, WEDNESDAY, moved)).toEqual({
      plannedSessions: 1,
      plannedSets: { CHEST: 3 },
    });
    expect(dayProfileOf(CALENDAR, TUESDAY, moved)).toBe('REST');
    expect(dayProfileOf(CALENDAR, WEDNESDAY, moved)).toBe('HIGH');
  });

  it('sin cambios manda el programa: nada se aplica solo a medianoche', () => {
    expect(dayProfileOf(CALENDAR, TUESDAY)).toBe('HIGH');
    expect(dayProfileOf(CALENDAR, WEDNESDAY)).toBe('REST');
  });
});

describe('P-20.3 · «no entreno hoy» baja la meta de hoy', () => {
  it('el día pasa a Descanso, y la sesión sigue planificada y no hecha (P-33: manda la asistencia)', () => {
    const changes = [change(MONDAY, 'NOT_TRAINING')];
    expect(dayProfileOf(CALENDAR, MONDAY, changes)).toBe('REST');
    expect(trainingTargetOf(CALENDAR, MONDAY, changes)?.plannedSessions).toBe(1);
  });
});

describe('P-20.4 · el perfil que el coach elige por fecha', () => {
  it('manda sobre el programa, y también sin programa', () => {
    expect(dayProfileOf(CALENDAR, WEDNESDAY, [change(WEDNESDAY, 'PROFILE', 'HIGH')])).toBe('HIGH');
    expect(dayProfileOf(null, WEDNESDAY, [change(WEDNESDAY, 'PROFILE', 'REST')])).toBe('REST');
    expect(dayProfileOf(null, WEDNESDAY)).toBeNull();
  });

  it('entre los cambios que tocan un día, manda el último', () => {
    const coachThenPatient = [change(MONDAY, 'PROFILE', 'HIGH'), change(MONDAY, 'NOT_TRAINING')];
    expect(dayProfileOf(CALENDAR, MONDAY, coachThenPatient)).toBe('REST');
    // Si el paciente deshace su «no entreno hoy», vuelve el perfil del coach.
    expect(dayProfileOf(CALENDAR, MONDAY, coachThenPatient.slice(0, 1))).toBe('HIGH');
    const movedThenCoach = [change(TUESDAY, 'MOVED'), change(WEDNESDAY, 'PROFILE', 'REST')];
    expect(dayProfileOf(CALENDAR, WEDNESDAY, movedThenCoach)).toBe('REST');
    const coachThenMoved = [change(WEDNESDAY, 'PROFILE', 'REST'), change(TUESDAY, 'MOVED')];
    expect(dayProfileOf(CALENDAR, WEDNESDAY, coachThenMoved)).toBe('HIGH');
  });
});

describe('P-20.3 · lo que se puede hacer hoy', () => {
  it('si mañana ya tiene sesión, solo «no entreno hoy»', () => {
    expect(dayOptions(CALENDAR, MONDAY, [])).toEqual({
      notTraining: true,
      moveToTomorrow: false,
      undo: null,
    });
  });

  it('con mañana libre, también «mover a mañana»; un día de descanso, nada', () => {
    expect(dayOptions(CALENDAR, TUESDAY, [])).toEqual({
      notTraining: true,
      moveToTomorrow: true,
      undo: null,
    });
    expect(dayOptions(CALENDAR, WEDNESDAY, [])).toEqual({
      notTraining: false,
      moveToTomorrow: false,
      undo: null,
    });
  });

  it('después de cambiar el día, solo deshacerlo mientras sea hoy', () => {
    expect(dayOptions(CALENDAR, TUESDAY, [change(TUESDAY, 'NOT_TRAINING')]).undo).toBe(
      'NOT_TRAINING',
    );
    expect(dayOptions(CALENDAR, TUESDAY, [change(TUESDAY, 'MOVED')])).toEqual({
      notTraining: false,
      moveToTomorrow: false,
      undo: 'MOVED',
    });
  });

  it('la sesión que llegó de ayer no se vuelve a mover, pero se puede dejar', () => {
    expect(dayOptions(CALENDAR, WEDNESDAY, [change(TUESDAY, 'MOVED')])).toEqual({
      notTraining: true,
      moveToTomorrow: false,
      undo: null,
    });
  });

  it('el último día del programa no se mueve fuera de él; sin programa no hay nada que cambiar', () => {
    const sundayOnly: ProgramCalendar = {
      startDate: MONDAY,
      weeks: [{ weekNo: 1, sessions: [{ position: 1, dayOfWeek: 7, setsByMuscle: {} }] }],
    };
    expect(dayOptions(sundayOnly, '2026-11-08', [])).toEqual({
      notTraining: true,
      moveToTomorrow: false,
      undo: null,
    });
    expect(dayOptions(null, MONDAY, [])).toEqual({
      notTraining: false,
      moveToTomorrow: false,
      undo: null,
    });
  });
});

describe('ADR-104 · hoy y mañana con sus metas', () => {
  it('Mateo mueve el martes: hoy 2,230 kcal de Descanso y mañana 2,750 de Alto, con su sesión', () => {
    const schedule = dayScheduleOf(CALENDAR, PLAN, TUESDAY, [change(TUESDAY, 'MOVED')]);
    expect(schedule.today).toEqual({
      localDate: TUESDAY,
      profile: { code: 'REST', name: 'Descanso' },
      kcal: 2_230,
      sessions: 0,
      change: 'MOVED',
    });
    expect(schedule.tomorrow).toEqual({
      localDate: WEDNESDAY,
      profile: { code: 'HIGH', name: 'Alto' },
      kcal: 2_750,
      sessions: 1,
      change: 'MOVED',
    });
    expect(schedule.options.undo).toBe('MOVED');
  });

  it('sin plan vigente no hay perfil ni kcal; sin programa, tampoco sesiones', () => {
    expect(dayScheduleOf(null, null, MONDAY, []).today).toEqual({
      localDate: MONDAY,
      profile: null,
      kcal: null,
      sessions: null,
      change: null,
    });
  });
});

describe('P-20.3 · las acciones de hoy', () => {
  it('cada acción agrega su cambio si el día lo permite', () => {
    expect(todayStepOf(CALENDAR, TUESDAY, [], 'NOT_TRAINING')).toEqual({
      ok: true,
      value: { add: 'NOT_TRAINING' },
    });
    expect(todayStepOf(CALENDAR, TUESDAY, [], 'MOVE_TO_TOMORROW')).toEqual({
      ok: true,
      value: { add: 'MOVED' },
    });
  });

  it('deshacer anula el cambio de hoy, no el de ayer', () => {
    const today = change(TUESDAY, 'MOVED');
    expect(todayStepOf(CALENDAR, TUESDAY, [today], 'UNDO')).toEqual({
      ok: true,
      value: { undo: today },
    });
    const undo = todayStepOf(CALENDAR, WEDNESDAY, [today], 'UNDO');
    expect(undo.ok ? null : undo.error.code).toBe('NC-TRK-016');
  });

  it('lo que el día no permite da su código', () => {
    const codeOf = (result: ReturnType<typeof todayStepOf>) =>
      result.ok ? null : result.error.code;
    expect(codeOf(todayStepOf(CALENDAR, WEDNESDAY, [], 'NOT_TRAINING'))).toBe('NC-TRK-014');
    expect(codeOf(todayStepOf(CALENDAR, MONDAY, [], 'MOVE_TO_TOMORROW'))).toBe('NC-TRK-015');
    expect(
      codeOf(todayStepOf(CALENDAR, TUESDAY, [change(TUESDAY, 'NOT_TRAINING')], 'NOT_TRAINING')),
    ).toBe('NC-TRK-014');
  });
});

describe('P-20.4 · el perfil del coach, solo hoy y mañana', () => {
  it('elige Entrenamiento o cualquier perfil del plan; null vuelve al programa', () => {
    expect(profileChoicesOf(PLAN).map(({ code }) => code)).toEqual(['TRAINING', 'REST', 'HIGH']);
    expect(profileChangeAllowed(PLAN, MONDAY, MONDAY, 'HIGH').ok).toBe(true);
    expect(profileChangeAllowed(PLAN, MONDAY, TUESDAY, 'TRAINING').ok).toBe(true);
    expect(profileChangeAllowed(PLAN, MONDAY, TUESDAY, null).ok).toBe(true);
  });

  it('pasado mañana, ayer o un perfil que el plan no tiene dan su código', () => {
    const codeOf = (result: ReturnType<typeof profileChangeAllowed>) =>
      result.ok ? null : result.error.code;
    expect(codeOf(profileChangeAllowed(PLAN, MONDAY, WEDNESDAY, 'HIGH'))).toBe('NC-TRK-017');
    expect(codeOf(profileChangeAllowed(PLAN, TUESDAY, MONDAY, 'HIGH'))).toBe('NC-TRK-017');
    expect(codeOf(profileChangeAllowed(PLAN, MONDAY, MONDAY, 'REFEED'))).toBe('NC-TRK-018');
    expect(codeOf(profileChangeAllowed(null, MONDAY, MONDAY, 'REST'))).toBe('NC-TRK-018');
    expect(profileChoicesOf({ ...PLAN, dayProfiles: [] })).toEqual([]);
  });
});
