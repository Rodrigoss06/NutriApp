import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { PlanActivation } from '../../../application/plan-activation.js';

/**
 * nutrition.plan.published (02 §8): la copia del plan vigente y la meta de hoy. Idempotente: la entrega se registra en
 * processed_event y la copia solo avanza.
 */
@Injectable()
export class PlansConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'tracking.plans';
  readonly eventTypes = ['nutrition.plan.published'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(PlanActivation) private readonly activation: PlanActivation,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (!event.organizationId) return;
    await this.activation.activate(event.organizationId, event.aggregateId);
  }
}
