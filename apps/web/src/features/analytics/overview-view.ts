import {
  formatNumber,
  OVERVIEW_ALERTS,
  type OverviewAlert,
  type OverviewPatient,
  type PatientSummary,
} from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';
import { formatDate } from '@/lib/dates';

/** Las alertas del panel (RF-34): color, ícono y texto, nunca solo color. */
export const ALERT_LABELS = {
  NO_RECENT_LOGS: 'Sin registros en 3 días',
  LOW_ADHERENCE: 'Adherencia baja',
  UNREAD_NOTES: 'Notas sin leer',
  READINESS_RED: 'Semáforo del día en rojo',
  READINESS_YELLOW: 'Semáforo del día en ámbar',
  WEEKLY_RED: 'Semana en rojo',
  WEEKLY_AMBER: 'Semana en ámbar',
  PENDING_REVIEW: 'Control semanal sin decidir',
} as const satisfies Record<OverviewAlert, string>;

export const ALERT_TONES = {
  NO_RECENT_LOGS: 'warning',
  LOW_ADHERENCE: 'warning',
  UNREAD_NOTES: 'info',
  READINESS_RED: 'danger',
  READINESS_YELLOW: 'warning',
  WEEKLY_RED: 'danger',
  WEEKLY_AMBER: 'warning',
  PENDING_REVIEW: 'info',
} as const satisfies Record<OverviewAlert, Tone>;

/** Dónde se atiende cada alerta, dentro del paciente: su seguimiento, su analítica o su control semanal. */
export function alertHref(patientId: string, alert: OverviewAlert): string {
  const base = `/panel/pacientes/${patientId}`;
  switch (alert) {
    case 'LOW_ADHERENCE':
      return `${base}/analitica`;
    case 'WEEKLY_RED':
    case 'WEEKLY_AMBER':
    case 'PENDING_REVIEW':
      return `${base}/entrenamiento/control-semanal`;
    default:
      return `${base}/seguimiento`;
  }
}

/** El filtro de la URL (?alerta=): solo un código conocido; cualquier otro valor es sin filtro. */
export function alertFilter(value: string | string[] | undefined): OverviewAlert | null {
  const code = Array.isArray(value) ? value[0] : value;
  return (OVERVIEW_ALERTS as readonly string[]).includes(code ?? '')
    ? (code as OverviewAlert)
    : null;
}

/** Los números con que se calcularon las alertas, en una línea cada uno; redondeo solo al mostrar (RN-D09). */
export function overviewFacts(patient: OverviewPatient): string[] {
  const facts = [
    patient.lastLogDate
      ? `Último registro: ${formatDate(patient.lastLogDate)}`
      : 'Todavía no registra en su app',
  ];
  if (patient.adherence7dPct !== null) {
    facts.push(`Adherencia de 7 días: ${formatNumber(patient.adherence7dPct, 'percent')} %`);
  }
  if (patient.unreadNotes > 0) {
    facts.push(
      patient.unreadNotes === 1
        ? '1 nota sin leer'
        : `${String(patient.unreadNotes)} notas sin leer`,
    );
  }
  return facts;
}

/** El nombre de cada paciente desde /patients (ADR-064): analytics no lee nombres. */
export function namesById(patients: readonly PatientSummary[]): ReadonlyMap<string, string> {
  return new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
}
