import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TrainingApi } from '../../training/index.js';
import { dailyTargetOf, localDate, replacesActivePlan } from '../domain/active-plan.js';
import { dayKindOf, trainingTargetOf } from '../domain/active-program.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';

/**
 * Al publicarse un programa (02 §8), tracking guarda su copia (active_plan_view) y fija la meta de entrenamiento de hoy, en la fecha
 * local del paciente (RN-G03, RN-G04). Si el plan vigente tiene metas de descanso, la meta de alimentación de hoy pasa a la del
 * tipo del día (07 §2). Los días anteriores no se tocan. Corre en la transacción del consumidor, con el contexto SYSTEM de la
 * organización.
 */
@Injectable()
export class ProgramActivation {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRACKING_STORE) private readonly store: TrackingStore,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  async activate(organizationId: string, programId: string): Promise<'ACTIVATED' | 'IGNORED'> {
    const program = await this.training.publishedProgram(programId);
    if (!program) return 'IGNORED';
    const active = await this.store.activeProgram(program.patientId);
    if (!replacesActivePlan(active?.publishedAt ?? null, program.publishedAt)) return 'IGNORED';
    const patient = await this.clinical.patientRef(program.patientId);
    if (!patient) return 'IGNORED';
    await this.store.saveActiveProgram({
      patientId: program.patientId,
      organizationId,
      programId,
      snapshot: program,
      effectiveFrom: program.startDate,
    });
    const today = localDate(this.clock.now(), patient.timezone);
    const calendar = { startDate: program.startDate, weeks: program.schedule.weeks };
    const target = trainingTargetOf(calendar, today);
    if (target) {
      await this.store.setTrainingTarget(
        { patientId: program.patientId, organizationId, localDate: today, target },
        'REPLACE',
      );
    }
    const plan = await this.store.activeNutritionPlan(program.patientId);
    if (plan?.targets.restDayTargets) {
      await this.store.setDailyTarget(
        {
          patientId: program.patientId,
          organizationId,
          localDate: today,
          planId: plan.planId,
          target: dailyTargetOf(plan.targets, dayKindOf(calendar, today)),
        },
        'REPLACE',
      );
    }
    return 'ACTIVATED';
  }
}
