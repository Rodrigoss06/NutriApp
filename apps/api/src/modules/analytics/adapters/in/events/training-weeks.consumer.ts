import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { TrainingProjection } from '../../../application/training-projection.js';

/**
 * training.program.published (02 §8): una versión nueva puede cambiar lo programado de las semanas que vienen (RN-F17), así que se
 * recalcula el volumen semanal de su línea. Idempotente: las semanas se recalculan enteras.
 */
@Injectable()
export class TrainingWeeksConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'analytics.training-weeks';
  readonly eventTypes = ['training.program.published'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(TrainingProjection) private readonly training: TrainingProjection,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const payload = event.payload as Record<string, unknown> | null;
    const patientId = payload?.patientId;
    if (!event.organizationId || typeof patientId !== 'string') return;
    await this.training.refreshPrograms(event.organizationId, patientId, [event.aggregateId]);
  }
}
