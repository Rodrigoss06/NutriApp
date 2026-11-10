import { formatNumber, type DaySchedule, type ScheduleDay } from '@nutricoach/contracts';

/** «Entrenamiento · 2,510 kcal · 1 sesión»: el perfil del día, sus kcal y sus sesiones (07 §2 y §8, ADR-104). */
export function scheduleLine(day: ScheduleDay): string {
  const parts: string[] = [];
  if (day.profile) parts.push(day.profile.name);
  if (day.kcal !== null) parts.push(`${formatNumber(day.kcal, 'kcal')} kcal`);
  if (day.sessions !== null) {
    parts.push(
      day.sessions === 0
        ? 'sin sesión'
        : `${String(day.sessions)} ${day.sessions === 1 ? 'sesión' : 'sesiones'}`,
    );
  }
  return parts.join(' · ');
}

/** Lo que cambió hoy, dicho al paciente (P-20.3): nada si manda el programa. */
export function todayNotice(schedule: DaySchedule): string | null {
  const { today, options } = schedule;
  if (options.undo === 'NOT_TRAINING') {
    return `Hoy no entrenas: tu meta es la de ${today.profile?.name ?? 'descanso'}.`;
  }
  if (options.undo === 'MOVED') return 'Tu sesión de hoy pasó a mañana.';
  if (today.change === 'MOVED') return 'Hoy haces la sesión que pasaste de ayer.';
  if (today.change === 'PROFILE' && today.profile) {
    return `Tu coach eligió ${today.profile.name} para hoy.`;
  }
  return null;
}

/** Si la agenda tiene algo que mostrar: un programa vigente o un cambio del día. */
export function hasSchedule(schedule: DaySchedule): boolean {
  return (
    schedule.today.sessions !== null ||
    schedule.today.change !== null ||
    schedule.tomorrow.change !== null
  );
}

/** El cambio que decidió un día, como lo lee el equipo (ADR-104). */
export const CHANGE_LABELS = {
  NOT_TRAINING: 'No entrena',
  MOVED: 'Sesión movida',
  PROFILE: 'Perfil elegido por el coach',
} as const;
