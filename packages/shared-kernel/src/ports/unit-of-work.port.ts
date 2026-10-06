import type { OrganizationId, PatientId, UserId } from '../id.js';

/** Roles del contexto de seguridad (RN-A04). SYSTEM es el worker: despacho, consumidores y mantenimiento. */
export const ACTOR_ROLES = [
  'OWNER',
  'ADMIN',
  'PROFESSIONAL',
  'PATIENT',
  'PLATFORM_ADMIN',
  'SYSTEM',
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/**
 * Quién actúa y sobre qué organización (02 §6, 05 §3). La unidad de trabajo lo fija en cada transacción con
 * set_config(..., true) y la RLS lo lee: app.org_id, app.user_id, app.role y app.patient_id.
 */
export interface SecurityContext {
  readonly organizationId: OrganizationId | null;
  readonly userId: UserId | null;
  readonly role: ActorRole;
  /** Solo con el rol PATIENT: sale de la sesión, nunca de la petición (02 §10). */
  readonly patientId: PatientId | null;
}

/** Contexto del worker: sin usuario; con organización cuando procesa un evento de una. */
export function systemContext(organizationId: OrganizationId | null = null): SecurityContext {
  return Object.freeze({ organizationId, userId: null, role: 'SYSTEM', patientId: null });
}

/**
 * Puerto de unidad de trabajo (02 §5 y §6): una transacción por comando, compartida por los repositorios y el
 * outbox sin pasarla de mano en mano. Las consultas usan una transacción de solo lectura con el mismo contexto.
 * Si `work` falla, nada de lo escrito queda, tampoco los eventos.
 */
export interface UnitOfWork {
  run<T>(context: SecurityContext, work: () => Promise<T>): Promise<T>;
  query<T>(context: SecurityContext, work: () => Promise<T>): Promise<T>;
}

/** Token de inyección de la UnitOfWork. */
export const UNIT_OF_WORK = Symbol.for('nutricoach.UnitOfWork');
