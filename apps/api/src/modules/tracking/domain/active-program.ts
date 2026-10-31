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
      readonly setsByMuscle: Readonly<Record<string, number>>;
    }[];
  }[];
}

const MS_PER_DAY = 86_400_000;
const asUtc = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** De lunes (1) a domingo (7). */
const isoWeekday = (date: string): number => new Date(asUtc(date)).getUTCDay() || 7;

/**
 * La meta de un día del programa (07 §8): cada semana tiene 7 días; los días 1 a N son las sesiones 1 a N y los demás, descanso. Una
 * sesión con su día de la semana va ese día. Fuera del programa no hay meta: null.
 */
export function trainingTargetOf(
  calendar: ProgramCalendar,
  localDate: string,
): TrainingDayTarget | null {
  const days = Math.round((asUtc(localDate) - asUtc(calendar.startDate)) / MS_PER_DAY);
  if (days < 0) return null;
  const week = calendar.weeks[Math.floor(days / 7)];
  if (!week) return null;
  const dayNumber = (days % 7) + 1;
  const weekday = isoWeekday(localDate);
  const sessions = week.sessions.filter((session) =>
    session.dayOfWeek === null ? session.position === dayNumber : session.dayOfWeek === weekday,
  );
  const plannedSets: Record<string, number> = {};
  for (const { setsByMuscle } of sessions) {
    for (const [muscle, sets] of Object.entries(setsByMuscle)) {
      plannedSets[muscle] = (plannedSets[muscle] ?? 0) + sets;
    }
  }
  return { plannedSessions: sessions.length, plannedSets };
}
