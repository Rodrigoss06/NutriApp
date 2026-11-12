import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUDIT_PORT,
  type AuditPort,
  type Id,
  type OrganizationId,
  type PatientId,
} from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  FileRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { ProgressPhotoCommands } from '../../../application/commands/progress-photo.commands.js';

/** La finalidad del consentimiento de las fotos (P-30). */
const PHOTOS_PURPOSE = 'PROGRESS_PHOTOS';

/**
 * Borra las fotos de progreso del alumno al archivarlo o cuando revoca su consentimiento (RN-G20, P-30; decisión de Rodrigo del
 * 2026-11-11: en el acto, sin días de gracia; reactivarlo no las recupera). Desde ese momento la API ya no las sirve; aquí se borran
 * las filas y los bytes, en la transacción del consumidor. Idempotente: sin fotos, no hace nada.
 */
@Injectable()
export class ProgressPhotosConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'training.progress-photos';
  readonly eventTypes = ['clinical.patient.archived', 'clinical.consent.revoked'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(ProgressPhotoCommands) private readonly commands: ProgressPhotoCommands,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const payload = (event.payload ?? {}) as { patientId?: unknown; purpose?: unknown };
    if (!event.organizationId || typeof payload.patientId !== 'string') return;
    if (event.type === 'clinical.consent.revoked' && payload.purpose !== PHOTOS_PURPOSE) return;
    const { removed, keys } = await this.commands.purge(payload.patientId);
    // Los bytes se descartan aunque la transacción todavía no confirme: se borran por regla y no hay nada que conservar.
    for (const key of keys) await this.files.discard(key);
    if (removed === 0) return;
    await this.audit.record(
      {
        organizationId: event.organizationId as OrganizationId,
        userId: null,
        role: 'SYSTEM',
        patientId: null,
      },
      {
        action: 'UPDATE',
        resourceType: 'training.progress_photo',
        resourceId: payload.patientId as Id<string>,
        patientId: payload.patientId as PatientId,
        changedFields: ['all_photos_deleted'],
      },
    );
  }
}
