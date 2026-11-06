import type {
  MovementTestResult,
  PhysicalTestSummaryResponse,
  Screening,
  TrainingSafetyResponse,
  WeeklyReview,
} from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';

export const PRESCRIPTION_STATUS_TONES = {
  BLOCKED_CLEARANCE: 'danger',
  BLOCKED_PAIN: 'danger',
  BLOCKED_SCREENING: 'danger',
  BLOCKED_REFERRED: 'danger',
  PENDING_APPROVAL: 'info',
  APPROVED: 'success',
} as const satisfies Record<TrainingSafetyResponse['status'], Tone>;

/** Qué significa cada estado y qué sigue (RN-F15, 07 §6). */
export const PRESCRIPTION_STATUS_MESSAGES = {
  BLOCKED_CLEARANCE: 'Falta el alta médica. Regístrala en el perfil de entrenamiento.',
  BLOCKED_PAIN:
    'Hay dolor en una prueba postural o síntomas de alarma. Revísalo antes de prescribir.',
  BLOCKED_SCREENING: 'Falta el cribado o la revisión de un cribado en rojo o ámbar.',
  BLOCKED_REFERRED: 'El cribado se derivó. Mientras siga así, no hay propuesta.',
  PENDING_APPROVAL:
    'Las tres llaves están abiertas. Toda propuesta queda pendiente de tu aprobación.',
  APPROVED: 'Las tres llaves están abiertas y la propuesta está aprobada.',
} as const satisfies Record<TrainingSafetyResponse['status'], string>;

export const SCREENING_STATUS_TONES = {
  GREEN: 'success',
  AMBER: 'warning',
  RED: 'danger',
} as const satisfies Record<Screening['status'], Tone>;

export const MOVEMENT_TEST_STATUS_TONES = {
  PENDING: 'info',
  REFER: 'danger',
  MODIFY: 'warning',
  CAUTION: 'warning',
  FIT: 'success',
} as const satisfies Record<MovementTestResult['status'], Tone>;

export const PHYSICAL_TEST_STATUS_TONES = {
  PENDING: 'info',
  BASELINE_RECORDED: 'info',
  REVIEW_CHANGE: 'warning',
} as const satisfies Record<PhysicalTestSummaryResponse['tests'][number]['status'], Tone>;

const TEST_VALUE = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** El valor de una prueba tal como se midió: hasta 2 decimales, sin ceros de relleno. Sin valor, una raya. */
export const formatTestValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : TEST_VALUE.format(value);

/** El semáforo del control semanal (07 §10): color, ícono y texto, nunca solo color. */
export const WEEKLY_LIGHT_LABELS = {
  GREEN: 'Verde',
  AMBER: 'Ámbar',
  RED: 'Rojo',
  NO_DATA: 'Sin datos',
} as const satisfies Record<WeeklyReview['light'], string>;

export const WEEKLY_LIGHT_TONES = {
  GREEN: 'success',
  AMBER: 'warning',
  RED: 'danger',
  NO_DATA: 'info',
} as const satisfies Record<WeeklyReview['light'], Tone>;

/** La decisión del coach (RN-F17). */
export const COACH_DECISION_LABELS = {
  KEEP: 'Mantener',
  ADJUST: 'Ajustar',
  DELOAD: 'Descargar',
} as const satisfies Record<NonNullable<WeeklyReview['decision']>['decision'], string>;
