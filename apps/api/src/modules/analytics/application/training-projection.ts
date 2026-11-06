import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { TrainingApi } from '../../training/index.js';
import { programCalendar } from '../domain/program-calendar.js';
import { localDateIn } from './local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';
import { weeklyMuscleRows } from './training-weeks.js';

/**
 * El volumen semanal por grupo muscular de cada programa (05.3, RF-33): recalcula todas las semanas ya empezadas de la línea del
 * programa, con su última versión publicada como lo programado (RN-F12), y reemplaza esas filas. Corre en la transacción de quien
 * llama, como SYSTEM de la organización.
 */
@Injectable()
export class TrainingProjection {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  /** Las líneas de los programas entrenados en el rango y la del programa vigente. Devuelve las filas escritas. */
  async refreshForRange(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const ids = new Set(await this.tracking.programIds(patientId, from, to));
    const active = await this.tracking.activeProgramId(patientId);
    if (active !== null) ids.add(active);
    return this.refreshPrograms(organizationId, patientId, [...ids]);
  }

  /** Las líneas de esos programas, una vez cada una. */
  async refreshPrograms(
    organizationId: string,
    patientId: string,
    programIds: readonly string[],
  ): Promise<number> {
    const patient = await this.clinical.patientRef(patientId);
    if (!patient) return 0;
    const today = localDateIn(this.clock.now(), patient.timezone);
    const lineageOf = new Map<string, string | null>();
    const lineage = async (programId: string): Promise<string | null> => {
      if (!lineageOf.has(programId)) {
        const snapshot = await this.training.publishedProgram(programId);
        lineageOf.set(
          programId,
          snapshot && snapshot.patientId === patientId ? snapshot.lineageId : null,
        );
      }
      return lineageOf.get(programId) ?? null;
    };
    const lineages = new Set<string>();
    for (const programId of programIds) {
      const id = await lineage(programId);
      if (id !== null) lineages.add(id);
    }
    let written = 0;
    for (const lineageId of lineages) {
      const latest = await this.training.latestPublishedOfLineage(lineageId);
      if (!latest) continue;
      const weeks = programCalendar(latest).filter((week) => week.weekStart <= today);
      const until = latest.endDate < today ? latest.endDate : today;
      const days =
        weeks.length === 0
          ? []
          : await this.tracking.dailyFacts(patientId, latest.startDate, until);
      const members = new Set<string>([latest.programId]);
      for (const day of days) {
        for (const workout of day.workouts) {
          if (workout.programId !== null && (await lineage(workout.programId)) === lineageId) {
            members.add(workout.programId);
          }
        }
      }
      const rows = weeklyMuscleRows({
        weeks,
        days,
        lineageProgramIds: members,
        programId: latest.programId,
      });
      await this.store.replaceWeeklyVolume(
        organizationId,
        patientId,
        latest.startDate,
        latest.endDate,
        rows,
      );
      written += rows.length;
    }
    return written;
  }
}
