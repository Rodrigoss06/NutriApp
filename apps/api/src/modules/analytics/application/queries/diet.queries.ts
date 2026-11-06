import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type Id,
  type OrganizationId,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import { RANGE_INVALID } from '../../domain/analytics-errors.js';
import type { DailySummary } from '../../domain/daily-summary.js';
import {
  addDays,
  ANALYTICS_DEFAULT_DAYS,
  ANALYTICS_MAX_DAYS,
  daysBetween,
  dietWeeks,
  mealSlotAdherence,
  type DietWeek,
  type MealSlotAdherence,
} from '../../domain/diet-weeks.js';
import { ADEQUACY_METHOD, averageAdequacy } from '../adequacy.js';
import { localDateIn } from '../local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from '../ports/analytics.ports.js';

export interface DietAnalyticsView {
  readonly from: string;
  readonly to: string;
  readonly adequacyRangePct: readonly [number, number];
  readonly method: typeof ADEQUACY_METHOD;
  readonly days: readonly DailySummary[];
  readonly weeks: readonly DietWeek[];
  readonly mealSlots: readonly MealSlotAdherence[];
}

/**
 * La analítica de dieta del paciente para su equipo (RF-32): lee el resumen ya agregado, sin sumar registros por petición (05 §1),
 * con la RLS del equipo de atención (RN-A05). La lectura queda en la auditoría (RN-B03).
 */
@Injectable()
export class DietQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  /** Sin rango, las últimas 4 semanas hasta hoy en la fecha local del paciente. */
  diet(
    context: SecurityContext,
    patientId: string,
    range: { readonly from: string | null; readonly to: string | null },
  ): Promise<Result<DietAnalyticsView, DomainError>> {
    return this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      const to = range.to ?? localDateIn(this.clock.now(), patient.timezone);
      const from = range.from ?? addDays(to, 1 - ANALYTICS_DEFAULT_DAYS);
      if (from > to || daysBetween(from, to) > ANALYTICS_MAX_DAYS) return err(RANGE_INVALID);
      const days = await this.store.dailySummaries(patientId, from, to);
      const adequacyRangePct = await this.tenancy.adequacyRangePct(
        context.organizationId as OrganizationId,
      );
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'analytics.patient_daily_summary',
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      return ok({
        from,
        to,
        adequacyRangePct,
        method: ADEQUACY_METHOD,
        days,
        weeks: dietWeeks(days, averageAdequacy(adequacyRangePct)),
        mealSlots: mealSlotAdherence(days),
      });
    });
  }
}
