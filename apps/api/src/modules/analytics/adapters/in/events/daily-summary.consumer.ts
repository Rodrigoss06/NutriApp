import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { DailyProjection } from '../../../application/daily-projection.js';
import { OverviewProjection } from '../../../application/overview-projection.js';
import { TrainingProjection } from '../../../application/training-projection.js';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Lo que cambia el volumen semanal: un entreno, o el ajuste de una serie o de un entreno (RN-G02). */
const TRAINING_TARGETS = new Set(['SET', 'WORKOUT']);

interface EventDay {
  readonly patientId: string;
  readonly localDate: string;
  readonly targetType: string | null;
}

/** El paciente y el día de un evento de tracking (02 §8); sin ellos, el evento no toca la analítica. */
function dayOf(payload: unknown): EventDay | null {
  if (payload === null || typeof payload !== 'object') return null;
  const { patientId, localDate, targetType } = payload as Record<string, unknown>;
  return typeof patientId === 'string' && typeof localDate === 'string' && isoDate.test(localDate)
    ? { patientId, localDate, targetType: typeof targetType === 'string' ? targetType : null }
    : null;
}

/**
 * tracking.*.logged, tracking.*.voided y tracking.log.adjusted (02 §8): recalcula el resumen y el 1RM del día afectado (RN-G02,
 * RN-G12) y, si cambió un entreno, el volumen de las semanas de su programa. Idempotente: se recalcula entero desde tracking, así
 * que repetir un evento o recibirlos desordenados da lo mismo.
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
    @Inject(TrainingProjection) private readonly training: TrainingProjection,
    @Inject(OverviewProjection) private readonly overview: OverviewProjection,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const day = dayOf(event.payload);
    const { organizationId } = event;
    if (!organizationId || !day) return;
    await this.projection.refresh(organizationId, day.patientId, day.localDate, day.localDate);
    const isWorkout = event.type.startsWith('tracking.workout.');
    const isTrainingAdjustment =
      event.type === 'tracking.log.adjusted' && TRAINING_TARGETS.has(day.targetType ?? '');
    if (isWorkout || isTrainingAdjustment) {
      await this.training.refreshForRange(
        organizationId,
        day.patientId,
        day.localDate,
        day.localDate,
      );
    }
    // El panel después del día: su adherencia lee el resumen recién escrito (RF-34).
    await this.overview.refresh(organizationId, day.patientId);
  }
}
