import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  type AuditPort,
  type Clock,
  type OrganizationId,
  type PatientId,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { SESSION_STORE, type SessionStore } from '../../../application/ports/iam.ports.js';

/** Las finalidades sin las que la app no funciona: revocarlas corta el acceso (RN-B02). */
const ACCESS_PURPOSES = new Set(['APP_ACCESS', 'HEALTH_DATA']);

/**
 * Cierra las sesiones de la app del paciente al archivarlo o al revocar APP_ACCESS o HEALTH_DATA (02 §8, RN-B02).
 * El evento trae la cuenta vinculada, si existe; la próxima petición de esa cuenta ya no autentica. Idempotente: cerrar
 * sesiones ya cerradas no hace nada.
 */
@Injectable()
export class PatientSessionsConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'iam.patient-sessions';
  readonly eventTypes = ['clinical.patient.archived', 'clinical.consent.revoked'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const payload = (event.payload ?? {}) as {
      userId?: unknown;
      purpose?: unknown;
      patientId?: unknown;
    };
    if (typeof payload.userId !== 'string') return;
    if (event.type === 'clinical.consent.revoked' && !ACCESS_PURPOSES.has(String(payload.purpose)))
      return;
    const closed = await this.sessions.revokeAll(payload.userId as UserId, this.clock.now());
    if (closed === 0) return;
    await this.audit.record(
      {
        organizationId: event.organizationId as OrganizationId | null,
        userId: null,
        role: 'SYSTEM',
        patientId: null,
      },
      {
        action: 'LOGOUT',
        resourceType: 'iam.session',
        changedFields: ['all_sessions'],
        // El dueño ve en la auditoría de qué paciente se cerraron las sesiones (RF-06).
        patientId: typeof payload.patientId === 'string' ? (payload.patientId as PatientId) : null,
      },
    );
  }
}
