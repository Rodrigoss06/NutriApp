import type { Id, PatientId } from '../id.js';
import type { SecurityContext } from './unit-of-work.port.js';

/** Acciones auditadas (RN-B03). Las escrituras se auditan desde sus eventos; las lecturas, al leer. */
export const AUDIT_ACTIONS = [
  'READ',
  'CREATE',
  'UPDATE',
  'PUBLISH',
  'EXPORT',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'GRANT',
  'REVOKE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Qué se hizo y sobre qué. Nunca valores clínicos: de un cambio solo se guardan los nombres de campo. */
export interface AuditEntry {
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId?: Id<string> | null;
  readonly patientId?: PatientId | null;
  readonly changedFields?: readonly string[];
  readonly outcome?: 'SUCCESS' | 'DENIED' | 'FAILURE';
}

/**
 * Puerto de auditoría (02 §10, RN-B03): toda lectura de expediente clínico y toda exportación. Falla cerrado:
 * si no se puede escribir, `record` falla y el caso de uso no entrega los datos.
 */
export interface AuditPort {
  record(context: SecurityContext, entry: AuditEntry): Promise<void>;
}

/** Token de inyección del AuditPort. */
export const AUDIT_PORT = Symbol.for('nutricoach.AuditPort');
