import type { Id, OrganizationId, PatientId, UserId } from '../id.js';

/**
 * Roles del contexto de seguridad (RN-A04). SYSTEM es el worker: despacho, consumidores y mantenimiento.
 * ANONYMOUS es una petición sin sesión (entrar, recuperar la contraseña) y ACCOUNT una sesión sin organización
 * activa (su propia cuenta). Ninguna política de la RLS les da acceso a datos de una organización.
 */
export const ACTOR_ROLES = [
  'OWNER',
  'ADMIN',
  'PROFESSIONAL',
  'PATIENT',
  'PLATFORM_ADMIN',
  'SYSTEM',
  'ACCOUNT',
  'ANONYMOUS',
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/**
 * Quién actúa y sobre qué organización (02 §6, 05 §3). La unidad de trabajo lo fija en cada transacción con
 * set_config(..., true) y la RLS lo lee: app.org_id, app.user_id, app.role, app.patient_id y app.member_id.
 */
export interface SecurityContext {
  readonly organizationId: OrganizationId | null;
  readonly userId: UserId | null;
  readonly role: ActorRole;
  /** Solo con el rol PATIENT: sale de la sesión, nunca de la petición (02 §10). */
  readonly patientId: PatientId | null;
  /** Con un rol de miembro: su fila de tenancy.member. El equipo de atención y las notas AUTHOR_ONLY lo usan (RN-A05). */
  readonly memberId?: Id<'MemberId'> | null;
  /** Solo con PLATFORM_ADMIN: el permiso de soporte vigente con que actúa (RN-A09); se audita. */
  readonly supportGrantId?: Id<'SupportGrantId'> | null;
}

/** Petición sin sesión. */
export function anonymousContext(): SecurityContext {
  return Object.freeze({ organizationId: null, userId: null, role: 'ANONYMOUS', patientId: null });
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
