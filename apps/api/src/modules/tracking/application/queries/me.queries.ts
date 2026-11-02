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
import { ClinicalApi } from '../../../clinical/index.js';
import { FoodApi, type FoodSummaryRecord } from '../../../food/index.js';
import type { PlanSnapshot } from '../../../nutrition/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import type { ProgramSnapshot } from '../../../training/index.js';
import { localDate as localDateOf } from '../../domain/active-plan.js';
import { sessionsOn } from '../../domain/active-program.js';
import {
  dayTotals,
  planView,
  recordWindow,
  type AppPlan,
  type DayTotals,
  type PlanView,
} from '../../domain/records.js';
import { FUTURE_DATE } from '../../domain/tracking-errors.js';
import {
  RECORD_STORE,
  type ActiveSnapshot,
  type DayTargetRow,
  type RecordStore,
  type StoredFoodLog,
  type StoredHydrationLog,
  type StoredMetric,
  type StoredNote,
} from '../ports/records.ports.js';

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

/** Las sesiones del programa vigente ese día (07 §8): ninguna en un descanso; sin programa o fuera de sus semanas, null. */
function sessionsOf(active: ActiveSnapshot | null, localDate: string): DaySessionView[] | null {
  if (!active) return null;
  const program = active.snapshot as ProgramSnapshot;
  const day = sessionsOn(
    {
      startDate: program.startDate,
      weeks: program.mesocycles.flatMap((mesocycle) => mesocycle.weeks),
    },
    localDate,
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
  ) {}

  /** Hoy: la meta del día (RN-G03) frente a lo registrado, el agua y la sesión del día. */
  today(context: SecurityContext): Promise<TodayView> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const today = await this.#today(scope.patientId);
      const [editWindowDays, target, foods, hydration, nutrition, training] = await Promise.all([
        this.tenancy.trackingEditWindowDays(scope.organizationId),
        this.store.dayTarget(scope.patientId, today),
        this.store.dayFoodLogs(scope.patientId, today),
        this.store.dayHydration(scope.patientId, today),
        this.store.activeNutrition(scope.patientId),
        this.store.activeTraining(scope.patientId),
      ]);
      const plan = appPlanOn(nutrition, today);
      return {
        localDate: today,
        editWindowDays,
        target,
        consumed: dayTotals(foods),
        waterMl: water(hydration),
        plan: plan ? { planId: plan.planId, modality: plan.modality } : null,
        sessions: sessionsOf(training, today),
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
      const [foods, hydration, notes, metrics] = await Promise.all([
        this.store.dayFoodLogs(scope.patientId, localDate),
        this.store.dayHydration(scope.patientId, localDate),
        this.store.dayNotes(scope.patientId, localDate),
        this.store.dayMetrics(scope.patientId, localDate),
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
      });
    });
  }

  /** El plan vigente por tiempos de comida, listo para registrar (RF-28); sin fecha, el de hoy. */
  plan(context: SecurityContext, localDate: string | null): Promise<PlanView | null> {
    const scope = scopeOf(context);
    return this.uow.query(context, async () => {
      const date = localDate ?? (await this.#today(scope.patientId));
      const plan = appPlanOn(await this.store.activeNutrition(scope.patientId), date);
      return plan ? planView(plan, date) : null;
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
