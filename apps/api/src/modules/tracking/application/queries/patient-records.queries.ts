import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { adjustedFoods, adjustedWaterMl, latestByTarget } from '../../domain/adjustments.js';
import { dayScheduleOf, type DaySchedule } from '../../domain/day-schedule.js';
import { dayTotals, type DayTotals } from '../../domain/records.js';
import { DayScheduleSource } from '../day-schedule-source.js';
import {
  RECORD_STORE,
  type RecordStore,
  type StoredAdjustment,
  type StoredCheckin,
  type StoredFoodLog,
  type StoredHydrationLog,
  type StoredMetric,
  type StoredNote,
  type StoredSetLog,
  type StoredWorkout,
} from '../ports/records.ports.js';

/** Un día del paciente como lo ve su equipo (RN-G01): sus registros vigentes y los ajustes del profesional (RN-G02). */
export interface PatientDayView {
  readonly localDate: string;
  readonly foods: readonly StoredFoodLog[];
  readonly hydration: readonly StoredHydrationLog[];
  readonly notes: readonly StoredNote[];
  readonly metrics: readonly StoredMetric[];
  readonly checkin: StoredCheckin | null;
  readonly workouts: readonly (StoredWorkout & { readonly sets: readonly StoredSetLog[] })[];
  readonly adjustments: readonly StoredAdjustment[];
  /** Con los ajustes aplicados: lo que usará la analítica (RN-G02). */
  readonly totals: DayTotals;
  readonly originalTotals: DayTotals;
  readonly waterMl: number;
  readonly originalWaterMl: number;
}

/**
 * Lo que el equipo de atención lee de los registros del paciente (RN-G01): en solo lectura, con su RLS (RN-A05). Cada lectura
 * queda en la auditoría (RN-B03). Las consultas van en secuencia dentro de la transacción (deuda de pg@9, ADR-083).
 */
@Injectable()
export class PatientRecordsQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(DayScheduleSource) private readonly schedules: DayScheduleSource,
  ) {}

  /**
   * Hoy y mañana del paciente con sus cambios, lo que se puede hacer hoy y los perfiles que el coach puede poner (P-20.3, P-20.4,
   * ADR-104). Es la agenda, no un registro clínico. Si el paciente no existe o no es de su equipo, undefined.
   */
  schedule(context: SecurityContext, patientId: string): Promise<DaySchedule | undefined> {
    return this.uow.query(context, async () => {
      const inputs = await this.schedules.load(patientId);
      return inputs
        ? dayScheduleOf(inputs.calendar, inputs.plan, inputs.today, inputs.changes)
        : undefined;
    });
  }

  /** Los registros de un día con los ajustes; si el paciente no existe o no es de su equipo, undefined. */
  day(
    context: SecurityContext,
    patientId: string,
    localDate: string,
  ): Promise<PatientDayView | undefined> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return undefined;
      const foods = await this.store.dayFoodLogs(patientId, localDate);
      const hydration = await this.store.dayHydration(patientId, localDate);
      const notes = await this.store.dayNotes(patientId, localDate);
      const metrics = await this.store.dayMetrics(patientId, localDate);
      const checkin = await this.store.activeCheckin(patientId, localDate);
      const workouts = await this.store.dayWorkouts(patientId, localDate);
      const sets = await this.store.daySets(patientId, localDate);
      const adjustments = await this.store.dayAdjustments(patientId, localDate);
      const latest = latestByTarget(adjustments);
      await this.#read(context, patientId, 'tracking.day');
      return {
        localDate,
        foods,
        hydration,
        notes,
        metrics,
        checkin,
        workouts: workouts.map((workout) => ({
          ...workout,
          sets: sets.filter((set) => set.workoutLogId === workout.id),
        })),
        adjustments,
        totals: dayTotals(adjustedFoods(foods, latest)),
        originalTotals: dayTotals(foods),
        waterMl: adjustedWaterMl(hydration, latest),
        originalWaterMl: hydration.reduce((total, log) => total + log.volumeMl, 0),
      };
    });
  }

  /** Las notas que nadie del equipo abrió (RN-G13), de la más antigua a la más nueva; sin el paciente, undefined. */
  unreadNotes(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly StoredNote[] | undefined> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return undefined;
      const notes = await this.store.unreadNotes(patientId, 100);
      await this.#read(context, patientId, 'tracking.note_log');
      return notes;
    });
  }

  #read(context: SecurityContext, patientId: string, resourceType: string): Promise<void> {
    return this.audit.record(context, {
      action: 'READ',
      resourceType,
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}
