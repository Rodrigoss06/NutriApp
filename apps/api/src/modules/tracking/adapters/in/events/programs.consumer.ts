import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { ProgramActivation } from '../../../application/program-activation.js';

/**
 * training.program.published (02 §8): la copia del programa vigente y la meta de entrenamiento de hoy. Idempotente: la entrega queda
 * en processed_event y la copia solo avanza.
 */
@Injectable()
export class ProgramsConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'tracking.programs';
  readonly eventTypes = ['training.program.published'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(ProgramActivation) private readonly activation: ProgramActivation,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (!event.organizationId) return;
    await this.activation.activate(event.organizationId, event.aggregateId);
  }
}
