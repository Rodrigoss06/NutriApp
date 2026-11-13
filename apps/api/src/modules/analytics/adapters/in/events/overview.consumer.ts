import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { APPOINTMENT_EVENTS } from '../../../../scheduling/index.js';
import { OverviewProjection } from '../../../application/overview-projection.js';

/**
 * Lo que cambia el panel del profesional sin cambiar el resumen diario (RF-34, 02 §8): las notas del paciente, la decisión de un
 * control semanal, el cierre de una evaluación y sus citas (la próxima, ADR-125). Los registros del día los atiende el consumidor del resumen, que recalcula el panel
 * después del día. Idempotente: la fila se recalcula entera.
 */
@Injectable()
export class OverviewConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'analytics.overview';
  readonly eventTypes = [
    'tracking.note.logged',
    'tracking.note.read',
    'training.review.decided',
    'assessment.evaluation.closed',
    'assessment.evaluation.amended',
    ...APPOINTMENT_EVENTS,
  ] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(OverviewProjection) private readonly overview: OverviewProjection,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const payload = event.payload as Record<string, unknown> | null;
    const patientId = payload?.patientId;
    if (!event.organizationId || typeof patientId !== 'string') return;
    await this.overview.refresh(event.organizationId, patientId);
  }
}
