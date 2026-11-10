import { addDays, latestChangeOn, movedFrom, movedInto, type DayChange } from './day-changes.js';

/** La meta de entrenamiento de un día (05.2, tracking.daily_target): la del programa vigente ese día (RN-G03). */
export interface TrainingDayTarget {
  readonly plannedSessions: number;
  /** Series planificadas por grupo muscular, con conteo fraccional (RN-F06). */
  readonly plannedSets: Readonly<Record<string, number>>;
}

/** Lo que la meta toma del snapshot del programa publicado. */
export interface ProgramCalendar {
  /** YYYY-MM-DD: el primer día del programa. */
  readonly startDate: string;
  readonly weeks: readonly {
    readonly weekNo: number;
    readonly sessions: readonly {
      readonly position: number;
      readonly dayOfWeek: number | null;
      /** El perfil de día de la sesión (P-20.4); null o ausente (snapshot de la versión 1), Entrenamiento. */
      readonly dayProfileCode?: string | null;
      readonly setsByMuscle: Readonly<Record<string, number>>;
    }[];
  }[];
}

const MS_PER_DAY = 86_400_000;
const asUtc = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** De lunes (1) a domingo (7). */
const isoWeekday = (date: string): number => new Date(asUtc(date)).getUTCDay() || 7;

/**
 * Las sesiones de un día del programa (07 §8): cada semana tiene 7 días; los días 1 a N son las sesiones 1 a N y los demás, descanso.
 * Una sesión con su día de la semana va ese día. Fuera del programa, null.
 */
function programSessionsOn<
  TSession extends { readonly position: number; readonly dayOfWeek: number | null },
>(
  calendar: {
    readonly startDate: string;
    readonly weeks: readonly { readonly weekNo: number; readonly sessions: readonly TSession[] }[];
  },
  localDate: string,
): { readonly weekNo: number; readonly sessions: readonly TSession[] } | null {
  const days = Math.round((asUtc(localDate) - asUtc(calendar.startDate)) / MS_PER_DAY);
  if (days < 0) return null;
  const week = calendar.weeks[Math.floor(days / 7)];
  if (!week) return null;
  const dayNumber = (days % 7) + 1;
  const weekday = isoWeekday(localDate);
  return {
    weekNo: week.weekNo,
    sessions: week.sessions.filter((session) =>
      session.dayOfWeek === null ? session.position === dayNumber : session.dayOfWeek === weekday,
    ),
  };
}

/**
 * Las sesiones de un día (07 §8) con los cambios del día (P-20.3, ADR-104): la que se movió a mañana sale de su día, que queda de
 * descanso, y llega al siguiente con su semana. Fuera del programa, null.
 */
export function sessionsOn<
  TSession extends { readonly position: number; readonly dayOfWeek: number | null },
>(
  calendar: {
    readonly startDate: string;
    readonly weeks: readonly { readonly weekNo: number; readonly sessions: readonly TSession[] }[];
  },
  localDate: string,
  changes: readonly DayChange[] = [],
): { readonly weekNo: number; readonly sessions: readonly TSession[] } | null {
  const arrived = movedInto(changes, localDate);
  const from = arrived && programSessionsOn(calendar, arrived.localDate);
  if (from) return from;
  const day = programSessionsOn(calendar, localDate);
  if (!day) return null;
  return movedFrom(changes, localDate) ? { weekNo: day.weekNo, sessions: [] } : day;
}

/**
 * El perfil de día (07 §8, P-20.4): el del último cambio del día si lo hay (P-20.3: «no entreno hoy» es Descanso; el coach elige
 * cualquiera); si no, el de su sesión (sin perfil, Entrenamiento; con dos sesiones, el de la primera), y un día sin sesión,
 * Descanso. Sin programa ni cambios, null: vale la meta de la prescripción.
 */
export function dayProfileOf(
  calendar: ProgramCalendar | null,
  localDate: string,
  changes: readonly DayChange[] = [],
): string | null {
  const latest = latestChangeOn(changes, localDate);
  if (latest?.kind === 'NOT_TRAINING') return 'REST';
  if (latest?.kind === 'PROFILE') return latest.dayProfileCode;
  if (!calendar) return null;
  const day = sessionsOn(calendar, localDate, changes);
  if (!day) return null;
  const [first] = day.sessions;
  if (!first) return 'REST';
  return first.dayProfileCode ?? 'TRAINING';
}

/**
 * La meta de un día del programa (07 §8): sus sesiones y las series por grupo muscular, con la sesión movida a mañana en su nuevo
 * día. «No entreno hoy» no la cambia: la sesión sigue planificada y no hecha. Fuera del programa no hay meta: null.
 */
export function trainingTargetOf(
  calendar: ProgramCalendar,
  localDate: string,
  changes: readonly DayChange[] = [],
): TrainingDayTarget | null {
  const day = sessionsOn(calendar, localDate, changes);
  if (!day) return null;
  const plannedSets: Record<string, number> = {};
  for (const { setsByMuscle } of day.sessions) {
    for (const [muscle, sets] of Object.entries(setsByMuscle)) {
      plannedSets[muscle] = (plannedSets[muscle] ?? 0) + sets;
    }
  }
  return { plannedSessions: day.sessions.length, plannedSets };
}

/** Lo que el paciente o el coach pueden hacer hoy (P-20.3, ADR-104). */
export interface DayOptions {
  /** «No entreno hoy»: hoy tiene sesión y nadie cambió todavía el día. */
  readonly notTraining: boolean;
  /**
   * «Mover a mañana»: la sesión es del programa de hoy (la que llegó de ayer no se vuelve a mover) y mañana es un día del programa
   * sin sesión.
   */
  readonly moveToTomorrow: boolean;
  /** «Sí entreno hoy»: el cambio de hoy que se puede deshacer, mientras no termine el día. */
  readonly undo: 'NOT_TRAINING' | 'MOVED' | null;
}

/** El «no entreno hoy» o el «mover a mañana» de ese día, si lo hay: el que se puede deshacer. */
export function todayChangeOf(
  changes: readonly DayChange[],
  today: string,
): (DayChange & { readonly kind: 'NOT_TRAINING' | 'MOVED' }) | null {
  return (
    changes.find(
      (change): change is DayChange & { readonly kind: 'NOT_TRAINING' | 'MOVED' } =>
        change.localDate === today && (change.kind === 'NOT_TRAINING' || change.kind === 'MOVED'),
    ) ?? null
  );
}

export function dayOptions(
  calendar: ProgramCalendar | null,
  today: string,
  changes: readonly DayChange[],
): DayOptions {
  const done = todayChangeOf(changes, today);
  if (done) return { notTraining: false, moveToTomorrow: false, undo: done.kind };
  if (!calendar) return { notTraining: false, moveToTomorrow: false, undo: null };
  const sessions = sessionsOn(calendar, today, changes)?.sessions.length ?? 0;
  const own = movedInto(changes, today)
    ? 0
    : (programSessionsOn(calendar, today)?.sessions.length ?? 0);
  const tomorrow = sessionsOn(calendar, addDays(today, 1), changes);
  return {
    notTraining: sessions > 0,
    moveToTomorrow: own > 0 && tomorrow !== null && tomorrow.sessions.length === 0,
    undo: null,
  };
}
