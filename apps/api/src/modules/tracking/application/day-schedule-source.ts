import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import type { ProgramSnapshot } from '../../training/index.js';
import { localDate as localDateOf, type PlanTargets } from '../domain/active-plan.js';
import type { ProgramCalendar } from '../domain/active-program.js';
import { addDays, type DayChange } from '../domain/day-changes.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from './ports/day-changes.ports.js';
import { RECORD_STORE, type ActiveSnapshot, type RecordStore } from './ports/records.ports.js';

/** Lo que la agenda de hoy y mañana necesita (ADR-104). */
export interface ScheduleInputs {
  readonly today: string;
  readonly calendar: ProgramCalendar | null;
  readonly plan: PlanTargets | null;
  /** Los cambios vigentes de ayer a mañana: el «mover a mañana» de ayer llega a hoy. */
  readonly changes: readonly DayChange[];
}

/** El calendario del programa vigente (07 §8), desde el snapshot que escribió training (RN-F12). */
export function calendarOf(active: ActiveSnapshot | null): ProgramCalendar | null {
  if (!active) return null;
  const program = active.snapshot as ProgramSnapshot;
  return { startDate: program.startDate, weeks: program.schedule.weeks };
}

/** Las metas del plan vigente ese día (RN-G03), desde el snapshot que escribió nutrition (RN-E15). */
export function planTargetsOn(
  active: ActiveSnapshot | null,
  localDate: string,
): PlanTargets | null {
  if (!active || localDate < active.effectiveFrom) return null;
  return active.snapshot as PlanTargets;
}

/** Lee la agenda de un paciente en la transacción de quien llama, con su RLS: la del paciente o la del coach. */
@Injectable()
export class DayScheduleSource {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(DAY_CHANGE_STORE) private readonly changes: DayChangeStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  async load(patientId: string): Promise<ScheduleInputs | null> {
    const patient = await this.clinical.patientRef(patientId);
    if (!patient) return null;
    const today = localDateOf(this.clock.now(), patient.timezone);
    // En secuencia dentro de la transacción (ADR-083).
    const nutrition = await this.store.activeNutrition(patientId);
    const training = await this.store.activeTraining(patientId);
    const changes = await this.changes.active(patientId, addDays(today, -1), addDays(today, 1));
    return {
      today,
      calendar: calendarOf(training),
      plan: planTargetsOn(nutrition, today),
      changes,
    };
  }
}
