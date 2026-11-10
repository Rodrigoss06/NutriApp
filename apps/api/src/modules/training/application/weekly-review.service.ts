import { Inject, Injectable } from '@nestjs/common';
import { runMethod, WEEKLY_REVIEW_JV } from '@nutricoach/engine';
import { CLOCK, ID_GENERATOR, type Clock, type IdGenerator } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { isClosed, weekDates } from '../domain/weekly-review.js';
import { PROGRAM_STORE, type ProgramStore } from './ports/program.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from './ports/weekly-review.ports.js';
import { WeekCheckinSources, type WeekCheckin } from './week-checkins.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

const dayOf = (checkin: WeekCheckin) => ({
  sessionMinutes: checkin.sessionMinutes,
  sessionRpe: checkin.sessionRpe,
  sleepHours: checkin.sleepHours,
  restingHrBpm: checkin.restingHrBpm,
  hrvMs: checkin.hrvMs,
  fatigue: checkin.fatigue,
  soreness: checkin.soreness,
  performancePct: checkin.performancePct,
  nutritionCompliancePct: checkin.nutritionCompliancePct,
  menstrualSymptoms: checkin.menstrualSymptoms,
});

/** Una semana sin factor (un programa a mano sin tabla de fases) vale el volumen base (07 §7). */
const BASE_VOLUME_FACTOR = 1;

/**
 * El control de cada semana cerrada de un programa publicado (RN-G16, 07 §10): agrega los registros diarios de la semana, con los
 * umbrales vigentes al cerrarla, y guarda el resultado del motor con método, versión e insumos con su hash (RN-D01). Si la semana
 * ya tiene un control vigente con los mismos insumos, no hace nada; si llegaron registros tardíos, crea otro y deja el anterior
 * reemplazado, con su decisión. Corre en la transacción de quien llama.
 */
@Injectable()
export class WeeklyReviewService {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(WeekCheckinSources) private readonly sources: WeekCheckinSources,
    @Inject(WEEKLY_REVIEW_STORE) private readonly store: WeeklyReviewStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
  ) {}

  /** Los controles escritos. */
  async reviewProgram(organizationId: string, programId: string): Promise<number> {
    const snapshot = await this.programs.snapshot(programId);
    if (!snapshot) return 0;
    const patient = await this.clinical.patientRef(snapshot.patientId);
    if (!patient || patient.status === 'ARCHIVED') return 0;
    const now = this.clock.now();
    const today = localDateOf(now, patient.timezone);
    const source = this.sources.get();
    let written = 0;
    for (const week of snapshot.mesocycles.flatMap((mesocycle) => mesocycle.weeks)) {
      const { weekStart, weekEnd } = weekDates(snapshot.startDate, week.weekNo);
      if (!isClosed(weekEnd, today)) continue;
      const threshold = await this.store.thresholdFor(organizationId, weekEnd);
      if (!threshold) continue;
      const checkins = await source.checkins(snapshot.patientId, weekStart, weekEnd);
      const weekly = await source.weeklyNutrition(snapshot.patientId, weekStart, weekEnd);
      const run = runMethod(WEEKLY_REVIEW_JV, {
        // Sin check-in del domingo no se envía: así los controles que ya existen conservan sus insumos y su hash (ADR-109).
        ...(weekly === null ? {} : { weeklyNutritionCompliancePct: weekly }),
        days: checkins.map(dayOf),
        plannedVolumeFactor: week.volumeFactor ?? BASE_VOLUME_FACTOR,
        thresholds: {
          performanceMinPct: threshold.performanceMinPct,
          weeklySleepMinHours: threshold.weeklySleepMinHours,
          fatigueSorenessAmberAbove: threshold.fatigueSorenessAmberAbove,
          nutritionMinPct: threshold.nutritionMinPct,
        },
      });
      if (!run.ok) continue;
      const current = await this.store.currentOf(snapshot.lineageId, week.weekNo);
      if (current?.inputsHash === run.result.inputsHash) continue;
      if (current) await this.store.supersede(current.id);
      const { outputs } = run.result;
      await this.store.insert({
        id: this.ids.newId<'WeeklyReviewId'>(),
        organizationId,
        patientId: snapshot.patientId,
        programId: snapshot.programId,
        weekNo: week.weekNo,
        weekStart,
        weekEnd,
        methodCode: run.result.methodCode,
        methodVersion: run.result.methodVersion,
        engineVersion: run.result.engineVersion,
        thresholdId: threshold.id,
        inputs: run.result.inputs,
        inputsHash: run.result.inputsHash,
        light: outputs.light,
        plannedVolumeFactor: outputs.plannedVolumeFactor,
        suggestedVolumeFactor: outputs.suggestedVolumeFactor,
        suggestedAction: outputs.suggestedAction,
        computedAt: now,
        coachDecision: null,
        decidedVolumeFactor: null,
        decisionNote: null,
        decidedBy: null,
        decidedAt: null,
        resultingProgramId: null,
        status: 'CURRENT',
      });
      written += 1;
    }
    return written;
  }
}
