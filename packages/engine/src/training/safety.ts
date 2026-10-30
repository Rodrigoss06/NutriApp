/**
 * Seguridad antes de prescribir (RN-F15, 07 §3): reglas puras de la plantilla V3, sin datos ni reloj. No son un
 * diagnóstico. Cambiar una regla sube esta versión, que se guarda con cada cribado y cada prueba postural.
 */
export const SAFETY_RULE_VERSION = '1.0.0';

/** Versión del formulario de cribado que responden estas reglas (05.2). */
export const SCREENING_FORM_VERSION = 'JV_SCREENING_V2';

export const CRITICAL_SCREENING_QUESTIONS = ['S01', 'S02', 'S03', 'S04'] as const;
export const REVIEW_SCREENING_QUESTIONS = ['S05', 'S06', 'S07', 'S08'] as const;
export type ScreeningQuestion =
  (typeof CRITICAL_SCREENING_QUESTIONS)[number] | (typeof REVIEW_SCREENING_QUESTIONS)[number];

export const SCREENING_STATUSES = ['GREEN', 'AMBER', 'RED'] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

/** Rojo con una crítica afirmativa, ámbar con una de revisión, verde si todas son No. No se promedia: basta una. */
export function screeningStatus(
  answers: Readonly<Record<ScreeningQuestion, boolean>>,
): ScreeningStatus {
  if (CRITICAL_SCREENING_QUESTIONS.some((code) => answers[code])) return 'RED';
  return REVIEW_SCREENING_QUESTIONS.some((code) => answers[code]) ? 'AMBER' : 'GREEN';
}

export const SCREENING_DECISIONS = ['START', 'LIMIT', 'REFER'] as const;
export type ScreeningDecision = (typeof SCREENING_DECISIONS)[number];

export const MOVEMENT_TEST_STATUSES = ['PENDING', 'REFER', 'MODIFY', 'CAUTION', 'FIT'] as const;
export type MovementTestStatus = (typeof MOVEMENT_TEST_STATUSES)[number];

export interface MovementTestScore {
  /** De 0 a 2 por lado: 2 adecuado, 1 compensación leve, 0 limitación clara. Null si falta. */
  readonly rightScore: number | null;
  readonly leftScore: number | null;
  readonly pain: boolean;
  readonly asymmetry: boolean;
}

/**
 * Estado de una prueba, con la precedencia de la V3 salvo que el dolor manda aunque falte un lado (P-14): la hoja deja
 * esa prueba en PENDIENTE y el dolor detendría la prueba igual.
 */
export function movementTestStatus(score: MovementTestScore): MovementTestStatus {
  const { rightScore, leftScore, pain, asymmetry } = score;
  if (pain) return 'REFER';
  if (rightScore === null || leftScore === null) return 'PENDING';
  if (rightScore === 0 || leftScore === 0) return 'MODIFY';
  return rightScore === 1 || leftScore === 1 || asymmetry ? 'CAUTION' : 'FIT';
}

export const MEDICAL_CLEARANCES = ['PENDING', 'CLEARED', 'NOT_REQUIRED'] as const;
export type MedicalClearance = (typeof MEDICAL_CLEARANCES)[number];

/** Lo que abre o cierra las tres llaves, en el estado vigente del paciente. */
export interface SafetyKeys {
  readonly medicalClearance: MedicalClearance;
  /** Síntomas neurológicos o mareos que registra el coach: bloquean como el dolor (07 §3.3). */
  readonly alarmSymptoms: boolean;
  /** Las pruebas de la evaluación postural vigente; vacío si no hay ninguna, que no bloquea (como la V3). */
  readonly movementStatuses: readonly MovementTestStatus[];
  /** El cribado más reciente; null si el paciente todavía no lo responde, que bloquea. */
  readonly screening: {
    readonly status: ScreeningStatus;
    readonly reviewDecision: ScreeningDecision | null;
  } | null;
}

export const PRESCRIPTION_STATUSES = [
  'BLOCKED_CLEARANCE',
  'BLOCKED_PAIN',
  'BLOCKED_SCREENING',
  'BLOCKED_REFERRED',
  'PENDING_APPROVAL',
  'APPROVED',
] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

const screeningBlock = (screening: SafetyKeys['screening']): PrescriptionStatus | null => {
  if (screening === null) return 'BLOCKED_SCREENING';
  if (screening.status === 'GREEN') return null;
  if (screening.reviewDecision === null) return 'BLOCKED_SCREENING';
  return screening.reviewDecision === 'REFER' ? 'BLOCKED_REFERRED' : null;
};

/**
 * El estado de la propuesta (07 §6): tres llaves, en este orden. Mientras una esté cerrada no hay propuesta. Abiertas,
 * queda pendiente de aprobación hasta que el coach apruebe todos sus ejercicios (RN-F14).
 */
export function prescriptionStatus(keys: SafetyKeys, allApproved = false): PrescriptionStatus {
  if (keys.medicalClearance === 'PENDING') return 'BLOCKED_CLEARANCE';
  if (keys.alarmSymptoms || keys.movementStatuses.includes('REFER')) return 'BLOCKED_PAIN';
  return screeningBlock(keys.screening) ?? (allApproved ? 'APPROVED' : 'PENDING_APPROVAL');
}

/** Si una llave sigue cerrada: la propuesta no se genera ni se publica (RN-F15). */
export const isPrescriptionBlocked = (status: PrescriptionStatus): boolean =>
  status !== 'PENDING_APPROVAL' && status !== 'APPROVED';
