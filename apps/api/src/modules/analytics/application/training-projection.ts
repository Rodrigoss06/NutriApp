import { Inject, Injectable } from '@nestjs/common';
import { fatigueFamilyOf, type FatigueFamily } from '@nutricoach/engine';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { ExerciseApi } from '../../exercise/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { TrainingApi, type ProgramSnapshot } from '../../training/index.js';
import { factorsOn, prescribedRest } from '../domain/adjusted-volume.js';
import { programCalendar } from '../domain/program-calendar.js';
import { localDateIn } from './local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';
import { weeklyMuscleRows } from './training-weeks.js';

/**
 * El volumen semanal por grupo muscular de cada programa (05.3, RF-33): recalcula todas las semanas ya empezadas de la línea del
 * programa, con su última versión publicada como lo programado (RN-F12), y reemplaza esas filas. Corre en la transacción de quien
 * llama, como SYSTEM de la organización. La familia de cada ejercicio (P-27.2) sale de la biblioteca: su patrón, su equipo y su
 * modalidad de hoy, también si está archivado.
 */
@Injectable()
export class TrainingProjection {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(ExerciseApi) private readonly exercises: ExerciseApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  /** La familia de cada ejercicio entrenado en esos días que aún no está en `families`. */
  private async addFamilies(
    families: Map<string, FatigueFamily | null>,
    days: readonly {
      readonly workouts: readonly { readonly sets: readonly { readonly exerciseId: string }[] }[];
    }[],
  ): Promise<void> {
    const missing = [
      ...new Set(
        days.flatMap((day) =>
          day.workouts.flatMap((workout) => workout.sets.map((set) => set.exerciseId)),
        ),
      ),
    ].filter((id) => !families.has(id));
    if (missing.length === 0) return;
    for (const exercise of await this.exercises.exercisesById(missing)) {
      families.set(
        exercise.id,
        fatigueFamilyOf({
          pattern: exercise.pattern,
          equipmentCode: exercise.equipmentCode,
          modality: exercise.modality,
        }),
      );
    }
  }

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
    // Los snapshots de cada versión: dicen la línea y el descanso prescrito de cada serie (ADR-106).
    const snapshots = new Map<string, ProgramSnapshot | null>();
    const lineage = async (programId: string): Promise<string | null> => {
      if (!lineageOf.has(programId)) {
        const snapshot = await this.training.publishedProgram(programId);
        snapshots.set(programId, snapshot);
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
    const versions =
      lineages.size > 0 ? await this.training.volumeFactorVersions(organizationId) : [];
    const families = new Map<string, FatigueFamily | null>();
    for (const lineageId of lineages) {
      const latest = await this.training.latestPublishedOfLineage(lineageId);
      if (!latest) continue;
      const weeks = programCalendar(latest).filter((week) => week.weekStart <= today);
      const until = latest.endDate < today ? latest.endDate : today;
      const days =
        weeks.length === 0
          ? []
          : await this.tracking.dailyFacts(patientId, latest.startDate, until);
      await this.addFamilies(families, days);
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
        factorsOn: (localDate) => factorsOn(versions, localDate),
        restOf: (workout, set) =>
          prescribedRest(
            workout.programId === null ? null : (snapshots.get(workout.programId) ?? null),
            workout.sessionId,
            set.exerciseId,
            set.setNo,
          ),
        familyOf: (exerciseId) => families.get(exerciseId) ?? null,
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
