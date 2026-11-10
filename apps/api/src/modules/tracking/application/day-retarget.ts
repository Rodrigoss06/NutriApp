import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  OUTBOX,
  systemContext,
  type Clock,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { dailyTargetOf, localDate } from '../domain/active-plan.js';
import { dayProfileOf, trainingTargetOf } from '../domain/active-program.js';
import { addDays } from '../domain/day-changes.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from './ports/day-changes.ports.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';
import { trackingEvent } from './tracking-events.js';

/**
 * Al cambiar el día (tracking.day.rescheduled, ADR-104), la meta de hoy se vuelve a fijar con los cambios vigentes (RN-G03, P-20.3):
 * la de alimentación del perfil que toca, y la de entrenamiento con la sesión que se movió. La de mañana la fija el trabajo de cada
 * hora cuando llega el día. Corre en la transacción del consumidor, con el contexto SYSTEM de la organización, y avisa a la
 * analítica con tracking.target.changed. Idempotente: se recalcula entera.
 */
@Injectable()
export class DayRetarget {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TRACKING_STORE) private readonly store: TrackingStore,
    @Inject(DAY_CHANGE_STORE) private readonly changes: DayChangeStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  async refresh(organizationId: OrganizationId, patientId: string): Promise<void> {
    const patient = await this.clinical.patientRef(patientId);
    if (!patient || patient.status === 'ARCHIVED') return;
    const today = localDate(this.clock.now(), patient.timezone);
    const plan = await this.store.activeNutritionPlan(patientId);
    const program = await this.store.activeProgram(patientId);
    const changes = await this.changes.active(patientId, addDays(today, -1), today);
    if (plan) {
      await this.store.setDailyTarget(
        {
          patientId,
          organizationId,
          localDate: today,
          planId: plan.planId,
          target: dailyTargetOf(
            plan.targets,
            dayProfileOf(program?.calendar ?? null, today, changes),
          ),
        },
        'REPLACE',
      );
    }
    const training = program && trainingTargetOf(program.calendar, today, changes);
    if (training) {
      await this.store.setTrainingTarget(
        { patientId, organizationId, localDate: today, target: training },
        'REPLACE',
      );
    }
    const context = systemContext(organizationId);
    await this.outbox.append(
      [
        trackingEvent(
          'tracking.target.changed',
          organizationId,
          patientId,
          { patientId, localDate: today },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}
