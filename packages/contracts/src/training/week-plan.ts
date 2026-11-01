/** De lunes (1) a domingo (7). */
export const WEEKDAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/** Una sesión del plan semanal: su orden en la semana, su día fijo si tiene, y su nombre. */
export interface WeekPlanSession {
  readonly position: number;
  readonly dayOfWeek: number | null;
  readonly name: string;
}

export interface WeekPlanDay {
  readonly label: string;
  /** Sin sesiones, es de descanso. */
  readonly sessions: readonly string[];
}

/** El día de una sesión (07 §8): sin día fijo, su orden en la semana; con él, ese día. */
export const sessionDay = (session: Pick<WeekPlanSession, 'position' | 'dayOfWeek'>): string =>
  session.dayOfWeek === null
    ? `Día ${String(session.position)}`
    : (WEEKDAY_LABELS[session.dayOfWeek - 1] ?? '');

/**
 * El plan de la semana (07 §8), con la misma regla que la meta de cada día en tracking; lo muestran la pantalla del programa y la ficha
 * de la rutina. Sin días fijos: los días 1 a 7, con la sesión de su orden. Con todos fijos: de lunes a domingo. Si se mezclan, qué día
 * toca depende de la fecha de inicio: cada sesión con el suyo.
 */
export function weekPlan(sessions: readonly WeekPlanSession[]): readonly WeekPlanDay[] {
  const namesOn = (matches: (session: WeekPlanSession) => boolean): readonly string[] =>
    sessions.filter(matches).map(({ name }) => name);
  if (sessions.every(({ dayOfWeek, position }) => dayOfWeek === null && position <= 7)) {
    return Array.from({ length: 7 }, (_, index) => ({
      label: `Día ${String(index + 1)}`,
      sessions: namesOn(({ position }) => position === index + 1),
    }));
  }
  if (sessions.every(({ dayOfWeek }) => dayOfWeek !== null)) {
    return WEEKDAY_LABELS.map((label, index) => ({
      label,
      sessions: namesOn(({ dayOfWeek }) => dayOfWeek === index + 1),
    }));
  }
  return [
    ...sessions.map((session) => ({ label: sessionDay(session), sessions: [session.name] })),
    { label: 'Los demás días', sessions: [] },
  ];
}
