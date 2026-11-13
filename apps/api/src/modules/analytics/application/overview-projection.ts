import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { AssessmentApi } from '../../assessment/index.js';
import { ClinicalApi } from '../../clinical/index.js';
import { SchedulingApi } from '../../scheduling/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { TrainingApi } from '../../training/index.js';
import { addDays } from '../domain/diet-weeks.js';
import { PANEL_BASE_WEEKS } from '../domain/fatigue-panel.js';
import { adherencePct, adherenceWindows, overviewAlerts } from '../domain/overview.js';
import { programCalendar } from '../domain/program-calendar.js';
import { fatiguePanelOf, panelWeeks } from './fatigue-panel.js';
import { localDateIn } from './local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';

/**
 * La fila de un paciente en el panel del profesional (RF-34, ADR-093): junta lo de tracking (último registro, notas sin leer y la
 * recuperación del día), lo de training (el control de la semana y los que esperan decisión), la última evaluación, la adherencia
 * del resumen diario y la próxima cita (ADR-125), y calcula las alertas en la fecha local del paciente (RN-G04). Corre en la transacción de quien llama, como
 * SYSTEM con la organización: la recalculan los eventos y un trabajo de cada hora. Un paciente archivado sale del panel.
 */
@Injectable()
export class OverviewProjection {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(SchedulingApi) private readonly scheduling: SchedulingApi,
  ) {}

  async refresh(organizationId: string, patientId: string): Promise<void> {
    const patient = await this.clinical.patientRef(patientId);
    if (!patient || patient.status === 'ARCHIVED') {
      await this.store.deleteOverview(patientId);
      return;
    }
    const now = this.clock.now();
    const today = localDateIn(now, patient.timezone);
    const window = adherenceWindows(today);
    const [facts, days, reviews, lastEvaluationAt] = [
      await this.tracking.overviewFacts(patientId),
      await this.store.dailySummaries(patientId, window.from30d, window.to),
      await this.training.reviewOverview(patientId),
      await this.assessment.lastClosedEvaluationAt(patientId),
    ];
    const latestFatigueWeek = await this.#latestFatigueWeek(organizationId, patientId, today);
    const nextAppointmentAt =
      (await this.scheduling.nextAppointments([patientId])).get(patientId) ?? null;
    const adherence7dPct = adherencePct(days.filter((day) => day.localDate >= window.from7d));
    const lastWeight = days.findLast((day) => day.bodyWeightKg !== null);
    await this.store.replaceOverview(organizationId, {
      patientId,
      lastLogDate: facts.lastRecordDate,
      lastEvaluationAt,
      lastWeightKg: lastWeight?.bodyWeightKg ?? null,
      adherence7dPct,
      adherence30dPct: adherencePct(days),
      unreadNotes: facts.unreadNotes,
      nextAppointmentAt,
      alerts: overviewAlerts({
        today,
        lastRecordDate: facts.lastRecordDate,
        firstTargetDate: facts.firstTargetDate,
        unreadNotes: facts.unreadNotes,
        latestCheckin: facts.latestCheckin,
        adherence7dPct,
        latestWeek: reviews.latest,
        undecidedReviews: reviews.undecided,
        latestFatigueWeek,
      }),
      updatedAt: now,
    });
  }

  /**
   * El estado general del panel de fatiga de la última semana cerrada del programa vigente (P-24, ADR-108), con sus 3 previas para
   * la base. Si cerró hace más de 7 días ya no alerta, y no se lee nada más.
   */
  async #latestFatigueWeek(
    organizationId: string,
    patientId: string,
    today: string,
  ): Promise<{ weekEnd: string; overall: 'GREEN' | 'AMBER' | 'RED' | 'NO_DATA' } | null> {
    const programId = await this.tracking.activeProgramId(patientId);
    const published = programId === null ? null : await this.training.publishedProgram(programId);
    if (!published || published.patientId !== patientId) return null;
    const snapshot =
      (await this.training.latestPublishedOfLineage(published.lineageId)) ?? published;
    const closed = programCalendar(snapshot).filter((week) => week.weekEnd < today);
    const last = closed.at(-1);
    if (!last || last.weekEnd < addDays(today, -7)) return null;
    const window = closed.slice(-1 - PANEL_BASE_WEEKS);
    const from = window[0]?.weekStart ?? last.weekStart;
    const days = await this.store.dailySummaries(patientId, from, last.weekEnd);
    const versions = await this.training.fatiguePanelThresholdVersions(organizationId);
    const row = fatiguePanelOf(panelWeeks(window, days, today), versions).get(last.weekNo);
    return row ? { weekEnd: last.weekEnd, overall: row.overall } : null;
  }
}
