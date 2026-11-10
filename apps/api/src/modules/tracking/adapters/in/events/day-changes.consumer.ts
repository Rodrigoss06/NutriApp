import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { DayRetarget } from '../../../application/day-retarget.js';

/** tracking.day.rescheduled (ADR-104): la meta de hoy con los cambios del día. Idempotente: se recalcula entera. */
@Injectable()
export class DayChangesConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'tracking.day-changes';
  readonly eventTypes = ['tracking.day.rescheduled'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(DayRetarget) private readonly retarget: DayRetarget,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const { patientId } = (event.payload ?? {}) as { patientId?: unknown };
    if (!event.organizationId || typeof patientId !== 'string') return;
    await this.retarget.refresh(event.organizationId as OrganizationId, patientId);
  }
}
