import { domainError, type DomainError } from '@nutricoach/shared-kernel';

/**
 * El control semanal del macrociclo (RN-G16, RN-F17, 07 §10): al cerrar cada semana, el motor sugiere mantener, ajustar o descargar
 * con los registros diarios de esa semana, y el coach decide con una nota. La semana siguiente cambia solo al publicarse la versión
 * nueva del programa (RN-F12). Un registro tardío crea un control nuevo y el anterior queda reemplazado con su decisión. Puro.
 */

export type WeeklyLight = 'GREEN' | 'AMBER' | 'RED' | 'NO_DATA';
export type WeeklyAction = 'CONTINUE' | 'ADJUST' | 'DELOAD' | 'MISSING_LOG';
export type CoachDecision = 'KEEP' | 'ADJUST' | 'DELOAD';
export type WeeklyReviewStatus = 'CURRENT' | 'SUPERSEDED';

export interface WeeklyReviewRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly programId: string;
  readonly weekNo: number;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly thresholdId: string;
  readonly inputs: unknown;
  /** SHA-256 en hexadecimal (RN-D01). */
  readonly inputsHash: string;
  readonly light: WeeklyLight;
  readonly plannedVolumeFactor: number;
  readonly suggestedVolumeFactor: number | null;
  readonly suggestedAction: WeeklyAction;
  readonly computedAt: Date;
  readonly coachDecision: CoachDecision | null;
  readonly decidedVolumeFactor: number | null;
  readonly decisionNote: string | null;
  /** El miembro del equipo que decidió. */
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly resultingProgramId: string | null;
  readonly status: WeeklyReviewStatus;
}

export interface DecisionInput {
  readonly decision: CoachDecision;
  /** El factor de volumen de la semana siguiente; mantener no lo cambia. */
  readonly volumeFactor: number | null;
  readonly note: string;
}

export const REVIEW_NOT_FOUND = domainError({
  code: 'NC-TRA-020',
  rule: 'RN-F17',
  message: 'Ese control semanal no existe para este paciente.',
});

export const REVIEW_SUPERSEDED = domainError({
  code: 'NC-TRA-021',
  rule: 'RN-F17',
  message: 'Llegaron registros nuevos de esa semana: decide sobre el control vigente.',
});

export const REVIEW_ALREADY_DECIDED = domainError({
  code: 'NC-TRA-022',
  rule: 'RN-F17',
  message: 'Ese control semanal ya tiene su decisión: no se cambia.',
});

export const DECISION_FACTOR_REQUIRED = domainError({
  code: 'NC-TRA-023',
  rule: 'RN-F17',
  message: 'Para ajustar o descargar, indica el factor de volumen de la semana siguiente.',
});

export const NO_PUBLISHED_PROGRAM = domainError({
  code: 'NC-TRA-024',
  rule: 'RN-G16',
  message: 'El paciente no tiene un programa publicado vigente.',
});

export const NO_THRESHOLDS = domainError({
  code: 'NC-TRA-025',
  rule: 'RN-G15',
  message: 'No hay umbrales vigentes: falta la fila base de la V3.',
});

const DAY_MS = 86_400_000;

/** Un día del calendario más o menos n días, como fecha local (RN-G04). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Las fechas de la semana n del macrociclo: empieza el día de inicio más 7 × (n − 1) días. */
export function weekDates(
  startDate: string,
  weekNo: number,
): { readonly weekStart: string; readonly weekEnd: string } {
  const weekStart = addDays(startDate, 7 * (weekNo - 1));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** Una semana se controla cuando cierra: su último día ya pasó en la fecha local del paciente (07 §10). */
export const isClosed = (weekEnd: string, today: string): boolean => weekEnd < today;

/** Lo que impide decidir sobre un control (RN-F17); null si se puede. */
export function decisionProblem(
  review: Pick<WeeklyReviewRecord, 'status' | 'coachDecision'>,
  input: DecisionInput,
): DomainError | null {
  if (review.status !== 'CURRENT') return REVIEW_SUPERSEDED;
  if (review.coachDecision !== null) return REVIEW_ALREADY_DECIDED;
  if (input.decision !== 'KEEP' && input.volumeFactor === null) return DECISION_FACTOR_REQUIRED;
  return null;
}

/** Mantener no crea versión nueva; ajustar o descargar, sí, si queda una semana siguiente (ADR-086). */
export const changesProgram = (decision: CoachDecision): boolean => decision !== 'KEEP';
