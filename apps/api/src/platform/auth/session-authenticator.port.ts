import type { OrganizationId, PatientId, UserId } from '@nutricoach/shared-kernel';

export type SessionKind = 'STAFF' | 'PATIENT' | 'PLATFORM';

/** Quién está detrás de una cookie de sesión válida. */
export interface SessionPrincipal {
  readonly sessionId: string;
  readonly userId: UserId;
  readonly kind: SessionKind;
  readonly activeOrganizationId: OrganizationId | null;
  readonly patientId: PatientId | null;
}

/**
 * Valida el hash del token de la cookie: sesión no revocada ni vencida y cuenta ACTIVE. Desliza la inactividad
 * como mucho una vez por minuto (RN-A08). La implementa iam.
 */
export interface SessionAuthenticator {
  authenticate(tokenHash: Uint8Array): Promise<SessionPrincipal | null>;
}

export const SESSION_AUTHENTICATOR = Symbol.for('nutricoach.SessionAuthenticator');
