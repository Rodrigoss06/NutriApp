import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { isSessionAlive, slideSession } from '../../domain/session-policy.js';
import { accountContext } from '../iam-context.js';
import {
  PATIENT_ENROLLMENT,
  SESSION_STORE,
  type PatientEnrollment,
  type SessionRecord,
  type SessionStore,
} from '../ports/iam.ports.js';

export type AuthenticatedSession = SessionRecord & { readonly patientId: string | null };

/**
 * Valida una sesión en cada petición (RN-A08): no revocada, no vencida y con la cuenta ACTIVE. Desliza la
 * inactividad como mucho una vez por minuto. Una sesión PATIENT resuelve su paciente en cada petición: si perdió
 * APP_ACCESS o HEALTH_DATA, o fue archivado, deja de valer (RN-B02). El paciente nunca envía su id (02 §10).
 */
@Injectable()
export class AuthenticateSessionHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(PATIENT_ENROLLMENT) private readonly enrollment: PatientEnrollment,
  ) {}

  async execute(tokenHash: Uint8Array): Promise<AuthenticatedSession | null> {
    const now = this.clock.now();
    const session = await this.uow.run(anonymousContext(), async () => {
      const found = await this.sessions.findByTokenHash(tokenHash);
      if (!found || found.accountStatus !== 'ACTIVE' || !isSessionAlive(found, now)) return null;
      const slide = slideSession(found.kind, found, now);
      if (!slide) return found;
      await this.sessions.slide(found.id, slide.lastSeenAt, slide.idleExpiresAt);
      return { ...found, ...slide };
    });
    if (!session) return null;
    if (session.kind !== 'PATIENT') return { ...session, patientId: null };
    const patient = await this.uow.query(accountContext(session.userId), () =>
      this.enrollment.patientOfAccount(),
    );
    if (!patient?.hasAccess || patient.organizationId !== session.activeOrganizationId) return null;
    return { ...session, patientId: patient.patientId };
  }
}
