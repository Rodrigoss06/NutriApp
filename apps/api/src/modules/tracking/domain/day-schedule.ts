import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { dailyTargetOf, TRAINING_PROFILE, type PlanTargets } from './active-plan.js';
import {
  dayOptions,
  dayProfileOf,
  sessionsOn,
  todayChangeOf,
  type DayOptions,
  type ProgramCalendar,
} from './active-program.js';
import { addDays, latestChangeOn, type DayChange, type DayChangeKind } from './day-changes.js';
import {
  DAY_NOT_RESCHEDULABLE,
  MOVE_UNAVAILABLE,
  NOT_TRAINING_UNAVAILABLE,
  NOTHING_TO_UNDO,
  UNKNOWN_DAY_PROFILE,
} from './tracking-errors.js';

/** Un día de la agenda, hoy o mañana: el perfil y las kcal que le tocan, sus sesiones y el cambio que lo decidió (ADR-104). */
export interface ScheduleDay {
  readonly localDate: string;
  /** El perfil de día; null si no hay plan o el plan no tiene perfiles. */
  readonly profile: { readonly code: string; readonly name: string } | null;
  /** Las kcal de la meta de ese perfil; null sin plan vigente. */
  readonly kcal: number | null;
  /** Las sesiones del programa ese día; null fuera del programa. */
  readonly sessions: number | null;
  /** El último cambio que lo toca; null si manda el programa. */
  readonly change: DayChangeKind | null;
}

export interface DaySchedule {
  readonly today: ScheduleDay;
  readonly tomorrow: ScheduleDay;
  readonly options: DayOptions;
  /** Los perfiles que el coach puede poner hoy o mañana (P-20.4). */
  readonly choices: readonly { readonly code: string; readonly name: string }[];
}

function scheduleDayOf(
  calendar: ProgramCalendar | null,
  plan: PlanTargets | null,
  localDate: string,
  changes: readonly DayChange[],
): ScheduleDay {
  const target = plan && dailyTargetOf(plan, dayProfileOf(calendar, localDate, changes));
  return {
    localDate,
    profile:
      target?.profileCode && target.profileName
        ? { code: target.profileCode, name: target.profileName }
        : null,
    kcal: target?.kcal ?? null,
    sessions: calendar ? (sessionsOn(calendar, localDate, changes)?.sessions.length ?? null) : null,
    change: latestChangeOn(changes, localDate)?.kind ?? null,
  };
}

/** Hoy y mañana con sus cambios, y lo que se puede hacer hoy (P-20.3). */
export function dayScheduleOf(
  calendar: ProgramCalendar | null,
  plan: PlanTargets | null,
  today: string,
  changes: readonly DayChange[],
): DaySchedule {
  return {
    today: scheduleDayOf(calendar, plan, today, changes),
    tomorrow: scheduleDayOf(calendar, plan, addDays(today, 1), changes),
    options: dayOptions(calendar, today, changes),
    choices: profileChoicesOf(plan),
  };
}

export type TodayAction = 'NOT_TRAINING' | 'MOVE_TO_TOMORROW' | 'UNDO';

/** Lo que hace una acción de hoy: agrega un cambio o anula el de hoy. */
export type TodayStep = { readonly add: 'NOT_TRAINING' | 'MOVED' } | { readonly undo: DayChange };

/**
 * «No entreno hoy», «mover a mañana» o «sí entreno hoy» (P-20.3): solo si el día lo permite. Mover no se ofrece si mañana ya tiene
 * sesión, ni dos veces seguidas; deshacer, solo el cambio de hoy (ADR-104).
 */
export function todayStepOf(
  calendar: ProgramCalendar | null,
  today: string,
  changes: readonly DayChange[],
  action: TodayAction,
): Result<TodayStep, DomainError> {
  const options = dayOptions(calendar, today, changes);
  switch (action) {
    case 'NOT_TRAINING':
      return options.notTraining ? ok({ add: 'NOT_TRAINING' }) : err(NOT_TRAINING_UNAVAILABLE);
    case 'MOVE_TO_TOMORROW':
      return options.moveToTomorrow ? ok({ add: 'MOVED' }) : err(MOVE_UNAVAILABLE);
    case 'UNDO': {
      const done = todayChangeOf(changes, today);
      return done ? ok({ undo: done }) : err(NOTHING_TO_UNDO);
    }
  }
}

/** Los perfiles que el coach puede elegir: Entrenamiento y los del plan vigente (P-20.4). Sin perfiles en el plan, ninguno. */
export function profileChoicesOf(
  plan: PlanTargets | null,
): readonly { readonly code: string; readonly name: string }[] {
  const profiles = plan?.dayProfiles ?? [];
  if (profiles.length === 0) return [];
  return [TRAINING_PROFILE, ...profiles.map(({ code, name }) => ({ code, name }))];
}

/** El perfil que el coach pone por fecha: solo hoy o mañana, y uno del plan vigente; null vuelve al programa (P-20.3, P-20.4). */
export function profileChangeAllowed(
  plan: PlanTargets | null,
  today: string,
  localDate: string,
  profileCode: string | null,
): Result<void, DomainError> {
  if (localDate !== today && localDate !== addDays(today, 1)) return err(DAY_NOT_RESCHEDULABLE);
  if (profileCode === null) return ok(undefined);
  return profileChoicesOf(plan).some(({ code }) => code === profileCode)
    ? ok(undefined)
    : err(UNKNOWN_DAY_PROFILE);
}
