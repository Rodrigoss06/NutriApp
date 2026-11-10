import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type OrganizationId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ContentApi } from '../../../content/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { FoodApi, type FoodSummaryRecord } from '../../../food/index.js';
import type { PlanSnapshot } from '../../../nutrition/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import type { ProgramSnapshot } from '../../../training/index.js';
import { localDate as localDateOf } from '../../domain/active-plan.js';
import { sessionsOn } from '../../domain/active-program.js';
import { addDays, type DayChange } from '../../domain/day-changes.js';
import { dayScheduleOf, type DaySchedule } from '../../domain/day-schedule.js';
import { sessionView, type SessionView } from '../../domain/training-day.js';
import {
  dayPortionsOf,
  dayTotals,
  planView,
  recordWindow,
  type AppPlan,
  type DayTotals,
  type PlanView,
} from '../../domain/records.js';
import { FUTURE_DATE } from '../../domain/tracking-errors.js';
import { trainingDayOf } from '../active-training.js';
import { calendarOf, planTargetsOn } from '../day-schedule-source.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from '../ports/day-changes.ports.js';
import {
  RECORD_STORE,
  type ActiveSnapshot,
  type DayTargetRow,
  type RecordStore,
  type StoredCheckin,
  type StoredFoodLog,
  type StoredHydrationLog,
  type StoredMetric,
  type StoredNote,
  type StoredReadiness,
  type StoredWorkout,
} from '../ports/records.ports.js';
import {
  WEEKLY_CHECKIN_STORE,
  type StoredWeeklyCheckin,
  type WeeklyCheckinStore,
} from '../ports/weekly-checkin.ports.js';
import { closesOn, openWeekDate } from '../../domain/weekly-checkin.js';

export interface DaySessionView {
  readonly position: number;
  readonly name: string;
  readonly dayOfWeek: number | null;
  readonly exerciseCount: number;
}

export interface TodayView {
  readonly localDate: string;
  readonly editWindowDays: number;
  readonly target: DayTargetRow | null;
  readonly consumed: DayTotals;
  readonly waterMl: number;
  readonly plan: { readonly planId: string; readonly modality: PlanView['modality'] } | null;
  readonly sessions: readonly DaySessionView[] | null;
  /** La recuperación e indicación de hoy, si ya hizo su registro diario (RN-G15). */
  readonly readiness: StoredReadiness | null;
  /** Hoy y mañana con sus cambios, y si hoy puede decir «no entreno hoy», «mover a mañana» o deshacerlo (P-20.3, ADR-104). */
  readonly schedule: DaySchedule;
  /** El check-in de la semana, abierto del domingo al martes (P-21, ADR-109); de miércoles a sábado, null. */
  readonly weeklyCheckin: {
    readonly weekDate: string;
    readonly closesOn: string;
    readonly asksWeight: boolean;
    readonly done: StoredWeeklyCheckin | null;
  } | null;
}

/** El entreno de hoy (RF-29): la semana del programa vigente, sus sesiones de hoy y lo ya registrado. */
export interface TrainingTodayView {
  readonly localDate: string;
  readonly program: {
    readonly programId: string;
    readonly name: string;
    readonly weekNo: number;
    readonly isDeload: boolean;
    readonly phase: string | null;
    readonly targetRir: number | null;
  } | null;
  readonly sessions: readonly SessionView[];
  readonly workouts: readonly StoredWorkout[];
  readonly checkin: StoredCheckin | null;
}

export interface DayView {
  readonly localDate: string;
  readonly editable: boolean;
  readonly foods: readonly StoredFoodLog[];
  readonly hydration: readonly StoredHydrationLog[];
  readonly notes: readonly StoredNote[];
  readonly metrics: readonly StoredMetric[];
  readonly totals: DayTotals;
  readonly waterMl: number;
  readonly checkin: StoredCheckin | null;
  readonly workouts: readonly StoredWorkout[];
}

interface PatientScope {
  readonly organizationId: OrganizationId;
  readonly patientId: string;
}

function scopeOf(context: SecurityContext): PatientScope {
  if (!context.organizationId || !context.patientId) {
    throw new Error('La app del paciente necesita su sesión.');
  }
  return { organizationId: context.organizationId, patientId: context.patientId };
}

const water = (logs: readonly StoredHydrationLog[]): number =>
  logs.reduce((total, log) => total + log.volumeMl, 0);

/** El plan vigente ese día, como lo muestra la app; antes de su vigencia, ninguno. */
function appPlanOn(active: ActiveSnapshot | null, localDate: string): AppPlan | null {
  if (!active || localDate < active.effectiveFrom) return null;
  // El snapshot lo escribió nutrition (RN-E15): su tipo cumple el de tracking, y el compilador lo comprueba aquí.
  const plan: AppPlan = active.snapshot as PlanSnapshot;
  return plan;
}

/**
 * Las sesiones del programa vigente ese día (07 §8), con la que se movió a mañana en su nuevo día (ADR-104): ninguna en un descanso;
 * sin programa o fuera de sus semanas, null.
 */
function sessionsOf(
  active: ActiveSnapshot | null,
  localDate: string,
  changes: readonly DayChange[],
): DaySessionView[] | null {
  if (!active) return null;
  const program = active.snapshot as ProgramSnapshot;
  const day = sessionsOn(
    {
      startDate: program.startDate,
      weeks: program.mesocycles.flatMap((mesocycle) => mesocycle.weeks),
    },
    localDate,
    changes,
  );
  return (
    day?.sessions.map((session) => ({
      position: session.position,
      name: session.name,
      dayOfWeek: session.dayOfWeek,
      exerciseCount: session.exercises.length,
    })) ?? null
  );
}

/**
 * Lo que la app del paciente lee de su seguimiento (RF-27, RF-28), con su RLS: solo lo suyo (RN-G01). Las fechas son las locales
 * del paciente (RN-G04).
 */
@Injectable()
export class MeQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(FoodApi) private readonly food: FoodApi,
    @Inject(DAY_CHANGE_STORE) private readonly dayChanges: DayChangeStore,
    @Inject(WEEKLY_CHECKIN_STORE) private readonly weeklyCheckins: WeeklyCheckinStore,
    @Inject(ContentApi) private readonly content: ContentApi,
  ) {}

  /** Hoy: la meta del día (RN-G03) frente a lo registrado, el agua y la sesión del día. */
  today(context: SecurityContext): Promise<TodayView> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const today = await this.#today(scope.patientId);
      const [editWindowDays, target, foods, hydration, nutrition, training, checkin, changes] =
        await Promise.all([
          this.tenancy.trackingEditWindowDays(scope.organizationId),
          this.store.dayTarget(scope.patientId, today),
          this.store.dayFoodLogs(scope.patientId, today),
          this.store.dayHydration(scope.patientId, today),
          this.store.activeNutrition(scope.patientId),
          this.store.activeTraining(scope.patientId),
          this.store.activeCheckin(scope.patientId, today),
          this.dayChanges.active(scope.patientId, addDays(today, -1), addDays(today, 1)),
        ]);
      const plan = appPlanOn(nutrition, today);
      const weekDate = openWeekDate(today);
      const weeklyCheckin =
        weekDate === null
          ? null
          : {
              weekDate,
              closesOn: closesOn(weekDate),
              asksWeight: await this.content.allowsWeightLog(scope.patientId),
              done: await this.weeklyCheckins.active(scope.patientId, weekDate),
            };
      return {
        localDate: today,
        editWindowDays,
        target,
        consumed: dayTotals(foods),
        waterMl: water(hydration),
        plan: plan ? { planId: plan.planId, modality: plan.modality } : null,
        sessions: sessionsOf(training, today, changes),
        readiness: checkin?.readiness ?? null,
        schedule: dayScheduleOf(
          calendarOf(training),
          planTargetsOn(nutrition, today),
          today,
          changes,
        ),
        weeklyCheckin,
      };
    });
  }

  /** Los registros vigentes de un día y su total (RN-G09); si todavía acepta cambios (RN-G10). Un día futuro, no. */
  day(context: SecurityContext, localDate: string): Promise<Result<DayView, DomainError>> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const today = await this.#today(scope.patientId);
      const windowDays = await this.tenancy.trackingEditWindowDays(scope.organizationId);
      const verdict = recordWindow(localDate, today, windowDays);
      if (verdict === 'FUTURE') return err(FUTURE_DATE);
      const [foods, hydration, notes, metrics, checkin, workouts] = await Promise.all([
        this.store.dayFoodLogs(scope.patientId, localDate),
        this.store.dayHydration(scope.patientId, localDate),
        this.store.dayNotes(scope.patientId, localDate),
        this.store.dayMetrics(scope.patientId, localDate),
        this.store.activeCheckin(scope.patientId, localDate),
        this.store.dayWorkouts(scope.patientId, localDate),
      ]);
      return ok({
        localDate,
        editable: verdict === 'OPEN',
        foods,
        hydration,
        notes,
        metrics,
        totals: dayTotals(foods),
        waterMl: water(hydration),
        checkin,
        workouts,
      });
    });
  }

  /** El entreno de hoy (RF-29): las sesiones del día como las ve el paciente (RN-F11), lo registrado y su registro diario. */
  trainingToday(context: SecurityContext): Promise<TrainingTodayView> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const today = await this.#today(scope.patientId);
      const [active, workouts, checkin, changes] = await Promise.all([
        this.store.activeTraining(scope.patientId),
        this.store.dayWorkouts(scope.patientId, today),
        this.store.activeCheckin(scope.patientId, today),
        this.dayChanges.active(scope.patientId, addDays(today, -1), today),
      ]);
      const training = trainingDayOf(active, today, changes);
      return {
        localDate: today,
        program: training && {
          programId: training.program.programId,
          name: training.program.name,
          weekNo: training.day.week.weekNo,
          isDeload: training.day.week.isDeload,
          phase: training.day.week.phaseEs,
          targetRir: training.day.week.targetRir,
        },
        sessions: training?.day.sessions.map(sessionView) ?? [],
        workouts,
        checkin,
      };
    });
  }

  /**
   * El plan vigente por tiempos de comida, listo para registrar (RF-28); sin fecha, el de hoy. Con las porciones del perfil de ese
   * día, el de su meta (RN-G03, P-20.5).
   */
  plan(context: SecurityContext, localDate: string | null): Promise<PlanView | null> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const date = localDate ?? (await this.#today(scope.patientId));
      const [active, target] = await Promise.all([
        this.store.activeNutrition(scope.patientId),
        this.store.dayTarget(scope.patientId, date),
      ]);
      const plan = appPlanOn(active, date);
      return plan ? planView(plan, date, dayPortionsOf(plan, target?.profile?.code ?? null)) : null;
    });
  }

  /** Algo fuera del plan (RN-G05): el catálogo que ve su organización, ordenado por parecido. */
  searchFoods(context: SecurityContext, text: string): Promise<readonly FoodSummaryRecord[]> {
    return this.uow.query(context, () => this.food.search(text, null, 20));
  }

  async #today(patientId: string): Promise<string> {
    const patient = await this.clinical.patientRef(patientId);
    return localDateOf(this.clock.now(), patient?.timezone ?? 'America/Lima');
  }
}
