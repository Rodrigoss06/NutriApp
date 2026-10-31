import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TrainingApi } from '../../training/index.js';
import { localDate, replacesActivePlan } from '../domain/active-plan.js';
import { trainingTargetOf } from '../domain/active-program.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';

/**
 * Al publicarse un programa (02 §8), tracking guarda su copia (active_plan_view) y fija la meta de entrenamiento de hoy, en la fecha
 * local del paciente (RN-G03, RN-G04). Los días anteriores no se tocan. Corre en la transacción del consumidor, con el contexto
 * SYSTEM de la organización.
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
    const target = trainingTargetOf(
      { startDate: program.startDate, weeks: program.schedule.weeks },
      today,
    );
    if (target) {
      await this.store.setTrainingTarget(
        { patientId: program.patientId, organizationId, localDate: today, target },
        'REPLACE',
      );
    }
    return 'ACTIVATED';
  }
}
