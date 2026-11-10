import { addDays } from './diet-weeks.js';

/**
 * Las alertas del panel del profesional (RF-34, ADR-086, ADR-093): se calculan con los hechos de cada paciente en su fecha local
 * (RN-G04) y se guardan en `analytics.patient_overview`. Puro: los hechos llegan de tracking, training y el resumen diario.
 */

/** Las alertas, en el orden en que se muestran. El contrato repite la lista para la web. */
export const OVERVIEW_ALERTS = [
  'NO_RECENT_LOGS',
  'LOW_ADHERENCE',
  'UNREAD_NOTES',
  'READINESS_RED',
  'READINESS_YELLOW',
  'WEEKLY_RED',
  'WEEKLY_AMBER',
  'FATIGUE_RED',
  'FATIGUE_AMBER',
  'PENDING_REVIEW',
] as const;
export type OverviewAlert = (typeof OVERVIEW_ALERTS)[number];

/** Sin registros en los 3 días que ya terminaron (ADR-086). */
export const NO_RECENT_LOGS_DAYS = 3;
/** Adherencia de 7 días baja: menor que 80 %, la alimentación mínima de 07 §11 (ADR-086). */
export const LOW_ADHERENCE_PCT = 80;
/** El semáforo de una semana deja de alertar 7 días después de que terminó: para entonces ya hay otra. */
const WEEKLY_LIGHT_DAYS = 7;

export interface OverviewInput {
  /** La fecha local del paciente (RN-G04). */
  readonly today: string;
  readonly lastRecordDate: string | null;
  readonly firstTargetDate: string | null;
  readonly unreadNotes: number;
  readonly latestCheckin: {
    readonly localDate: string;
    readonly indication: 'GREEN' | 'YELLOW' | 'RED' | 'NO_DATA' | null;
  } | null;
  readonly adherence7dPct: number | null;
  readonly latestWeek: {
    readonly weekEnd: string;
    readonly light: 'GREEN' | 'AMBER' | 'RED' | 'NO_DATA';
  } | null;
  readonly undecidedReviews: number;
  /** El estado general del panel de fatiga de la última semana cerrada del programa (P-24, ADR-108). */
  readonly latestFatigueWeek: {
    readonly weekEnd: string;
    readonly overall: 'GREEN' | 'AMBER' | 'RED' | 'NO_DATA';
  } | null;
}

/**
 * RN-G09 · días en rango ÷ días con meta, en porcentaje y sin redondear (RN-D09); null si ningún día tiene meta: sin meta no hay
 * adherencia que medir.
 */
export function adherencePct(
  days: readonly { readonly targetKcal: number | null; readonly kcalInRange: boolean | null }[],
): number | null {
  const withTarget = days.filter((d) => d.targetKcal !== null).length;
  if (withTarget === 0) return null;
  return (days.filter((d) => d.kcalInRange === true).length / withTarget) * 100;
}

/** Las ventanas de la adherencia: los 7 y los 30 días que terminaron ayer; hoy todavía no terminó. */
export function adherenceWindows(today: string): { to: string; from7d: string; from30d: string } {
  const to = addDays(today, -1);
  return { to, from7d: addDays(to, -6), from30d: addDays(to, -29) };
}

export function overviewAlerts(input: OverviewInput): OverviewAlert[] {
  const alerts: OverviewAlert[] = [];
  const yesterday = addDays(input.today, -1);
  // Los días sin registro empiezan después del último; quien nunca registró, desde su primera meta.
  const quietSince =
    input.lastRecordDate === null ? input.firstTargetDate : addDays(input.lastRecordDate, 1);
  if (quietSince !== null && quietSince <= addDays(input.today, -NO_RECENT_LOGS_DAYS)) {
    alerts.push('NO_RECENT_LOGS');
  }
  if (input.adherence7dPct !== null && input.adherence7dPct < LOW_ADHERENCE_PCT) {
    alerts.push('LOW_ADHERENCE');
  }
  if (input.unreadNotes > 0) alerts.push('UNREAD_NOTES');
  const checkin = input.latestCheckin;
  if (checkin && checkin.localDate >= yesterday) {
    if (checkin.indication === 'RED') alerts.push('READINESS_RED');
    if (checkin.indication === 'YELLOW') alerts.push('READINESS_YELLOW');
  }
  const week = input.latestWeek;
  if (week && week.weekEnd >= addDays(input.today, -WEEKLY_LIGHT_DAYS)) {
    if (week.light === 'RED') alerts.push('WEEKLY_RED');
    if (week.light === 'AMBER') alerts.push('WEEKLY_AMBER');
  }
  // El panel de fatiga solo informa (P-25): alerta como el semáforo de la semana, mientras no haya otra cerrada.
  const fatigue = input.latestFatigueWeek;
  if (fatigue && fatigue.weekEnd >= addDays(input.today, -WEEKLY_LIGHT_DAYS)) {
    if (fatigue.overall === 'RED') alerts.push('FATIGUE_RED');
    if (fatigue.overall === 'AMBER') alerts.push('FATIGUE_AMBER');
  }
  if (input.undecidedReviews > 0) alerts.push('PENDING_REVIEW');
  return alerts;
}
