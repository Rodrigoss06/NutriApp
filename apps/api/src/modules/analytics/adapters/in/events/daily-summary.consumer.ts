import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { DailyProjection } from '../../../application/daily-projection.js';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** El paciente y el día de un evento de tracking (02 §8); sin ellos, el evento no toca el resumen. */
function dayOf(payload: unknown): { patientId: string; localDate: string } | null {
  if (payload === null || typeof payload !== 'object') return null;
  const { patientId, localDate } = payload as Record<string, unknown>;
  return typeof patientId === 'string' && typeof localDate === 'string' && isoDate.test(localDate)
    ? { patientId, localDate }
    : null;
}

/**
 * tracking.*.logged, tracking.*.voided y tracking.log.adjusted (02 §8): recalcula el resumen del día afectado (RN-G02, RN-G12).
 * Idempotente: el día se recalcula entero desde tracking, así que repetir un evento o recibirlos desordenados da lo mismo.
 */
@Injectable()
export class DailySummaryConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'analytics.daily-summary';
  readonly eventTypes = [
    'tracking.food.logged',
    'tracking.food.voided',
    'tracking.hydration.logged',
    'tracking.hydration.voided',
    'tracking.metric.logged',
    'tracking.metric.voided',
    'tracking.checkin.logged',
    'tracking.checkin.voided',
    'tracking.workout.logged',
    'tracking.workout.voided',
    'tracking.log.adjusted',
  ] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(DailyProjection) private readonly projection: DailyProjection,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const day = dayOf(event.payload);
    if (!event.organizationId || !day) return;
    await this.projection.refresh(
      event.organizationId,
      day.patientId,
      day.localDate,
      day.localDate,
    );
  }
}
