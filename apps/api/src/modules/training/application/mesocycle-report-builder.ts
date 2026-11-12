import { Inject, Injectable } from '@nestjs/common';
import {
  MESOCYCLE_REPORT_JV,
  METHODS,
  runMethod,
  WEEKLY_REVIEW_JV,
  type CalculationResult,
  type MesocycleExerciseOneRm,
  type MesocycleReportInput,
  type MesocycleReportOutput,
  type WeeklyReviewInput,
} from '@nutricoach/engine';
import { AssessmentApi, type EvolutionView } from '../../assessment/index.js';
import { doneInWeek, reportMesocycle, type ReportMesocycle } from '../domain/mesocycle-report.js';
import {
  averageStress,
  type CoachDecision,
  type WeeklyAction,
  type WeeklyLight,
} from '../domain/weekly-review.js';
import { MesocycleReportSources } from './mesocycle-report-sources.js';
import { PROGRAM_STORE, type ProgramStore } from './ports/program.ports.js';
import type { ReportOneRmPoint } from './ports/mesocycle-report.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from './ports/weekly-review.ports.js';
import type { ProgramSnapshot } from './program-document.js';
import { WeekCheckinSources } from './week-checkins.js';

/** La versión del esquema del snapshot del informe: la web la lee antes que lo demás (05 §2). */
export const MESOCYCLE_REPORT_SCHEMA_VERSION = 1;

/** Desde cuándo se busca el mejor 1RM de antes del mesociclo: toda la historia del alumno. */
const HISTORY_START = '2000-01-01';

/** La comparativa física de la hoja (ADR-107): peso, cintura y cadera, y el % de grasa de cada método y equipo. */
const COMPARED_SITES = new Set(['BASIC_WEIGHT', 'GIRTH_WAIST', 'GIRTH_HIP']);
const FAT_PCT = 'FAT_PCT';

/** El control semanal de una semana del mesociclo, como lo muestra el informe (07 §10). */
export interface ReportWeekReview {
  readonly weekNo: number;
  readonly light: WeeklyLight;
  readonly suggestedAction: WeeklyAction;
  readonly suggestedVolumeFactor: number | null;
  readonly coachDecision: CoachDecision | null;
  readonly decidedVolumeFactor: number | null;
  readonly method: { readonly code: string; readonly version: string };
}

/** Lo que muestra el informe y congela enviarlo (RN-G19, RN-D08). */
export interface ReportBody {
  readonly schemaVersion: typeof MESOCYCLE_REPORT_SCHEMA_VERSION;
  /** La fecha local del alumno con que se calculó. */
  readonly computedOn: string;
  readonly program: {
    readonly programId: string;
    readonly lineageId: string;
    readonly versionNo: number;
    readonly name: string;
    readonly oneRmFormula: string;
    /** El método del 1RM de los récords, para mostrarlo junto a cada uno (RN-D02); null con una fórmula sin método. */
    readonly oneRmMethod: { readonly code: string; readonly version: string } | null;
  };
  readonly mesocycle: {
    readonly position: number;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly weeks: readonly {
      readonly weekNo: number;
      readonly weekStart: string;
      readonly weekEnd: string;
      readonly isDeload: boolean;
      readonly started: boolean;
    }[];
  };
  /** MESOCYCLE_REPORT_JV con las semanas que ya empezaron (RN-D01); null si ninguna empezó. */
  readonly numbers: CalculationResult<MesocycleReportInput, MesocycleReportOutput> | null;
  readonly reviews: readonly ReportWeekReview[];
  /** El nombre de cada ejercicio con récord, como en el programa publicado (RN-F12). */
  readonly exerciseNames: Readonly<Record<string, string>>;
  /** La evolución hasta el último día del mesociclo, solo con lo de la comparativa física; null sin evaluaciones. */
  readonly evolution: EvolutionView | null;
}

const minDate = (a: string, b: string): string => (a < b ? a : b);

/** El método de una fórmula de 1RM del registro del motor (RN-F04); null si no es un método. */
function oneRmMethodOf(
  formula: string,
): { readonly code: string; readonly version: string } | null {
  const method = (
    METHODS as Readonly<Record<string, { code: string; version: string } | undefined>>
  )[formula];
  return method ? { code: method.code, version: method.version } : null;
}

/** Los 1RM con la fórmula del alumno: el mejor de antes del mesociclo y los de cada día dentro de él, de lo que hizo dentro. */
export function exerciseOneRms(
  points: readonly ReportOneRmPoint[],
  formula: string,
  from: string,
  until: string,
): MesocycleExerciseOneRm[] {
  const byExercise = new Map<
    string,
    { bestBeforeKg: number | null; days: { localDate: string; estimated1rmKg: number }[] }
  >();
  for (const point of points) {
    if (point.formula !== formula || point.localDate > until) continue;
    const entry = byExercise.get(point.exerciseId) ?? { bestBeforeKg: null, days: [] };
    if (point.localDate < from) {
      entry.bestBeforeKg = Math.max(entry.bestBeforeKg ?? 0, point.estimated1rmKg);
    } else {
      entry.days.push({ localDate: point.localDate, estimated1rmKg: point.estimated1rmKg });
    }
    byExercise.set(point.exerciseId, entry);
  }
  // En orden de ejercicio y de fecha: los mismos registros dan siempre los mismos insumos y el mismo hash (RN-D01).
  return [...byExercise.entries()]
    .filter(([, entry]) => entry.days.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([exerciseId, entry]) => ({
      exerciseId,
      bestBeforeKg: entry.bestBeforeKg,
      days: [...entry.days].sort((a, b) => a.localDate.localeCompare(b.localDate)),
    }));
}

/** Solo lo de la comparativa física (ADR-107): así el informe no congela toda la evolución. */
const comparisonOnly = (view: EvolutionView): EvolutionView => ({
  evaluations: view.evaluations,
  sites: view.sites.filter((site) => COMPARED_SITES.has(site.siteCode)),
  skinfoldSum6: null,
  metrics: view.metrics.filter((metric) => metric.metricCode === FAT_PCT),
  bia: view.bia.filter((reading) => reading.metric === FAT_PCT),
});

function exerciseNamesOf(snapshot: ProgramSnapshot, ids: ReadonlySet<string>) {
  const names: Record<string, string> = {};
  for (const mesocycle of snapshot.mesocycles) {
    for (const week of mesocycle.weeks) {
      for (const session of week.sessions) {
        for (const exercise of session.exercises) {
          if (ids.has(exercise.exerciseId)) names[exercise.exerciseId] = exercise.name;
        }
      }
    }
  }
  for (const id of ids) names[id] ??= 'Ejercicio';
  return names;
}

/**
 * Arma el informe de un mesociclo (P14.5, PR 7a; P-28 y P-29; ADR-117) en la transacción de quien llama, con su RLS:
 * - lo planificado sale de la última versión publicada de la línea del programa, como la analítica (RN-F12);
 * - lo hecho, de los entrenos de la línea dentro de las fechas del mesociclo, contados en la semana de su sesión (ADR-083);
 * - los récords, del read model de 1RM con la fórmula del alumno (RN-F04), contra el mejor de toda su historia;
 * - el resumen de cada semana, de su control semanal vigente (07 §10), con el estrés del registro diario (ADR-107);
 * - la comparativa física, de la evolución hasta el último día del mesociclo (ADR-107).
 */
@Injectable()
export class MesocycleReportBuilder {
  constructor(
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(WEEKLY_REVIEW_STORE) private readonly reviews: WeeklyReviewStore,
    @Inject(WeekCheckinSources) private readonly checkins: WeekCheckinSources,
    @Inject(MesocycleReportSources) private readonly sources: MesocycleReportSources,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
  ) {}

  /** El mesociclo de esa posición en la última versión publicada de la línea; null si no está. */
  async mesocycleOf(
    lineageId: string,
    position: number,
  ): Promise<{ snapshot: ProgramSnapshot; mesocycle: ReportMesocycle } | null> {
    const snapshot = await this.programs.latestSnapshot(lineageId);
    const mesocycle = snapshot ? reportMesocycle(snapshot, position) : null;
    return snapshot && mesocycle ? { snapshot, mesocycle } : null;
  }

  /** El mesociclo de esa posición en el programa publicado del alumno; null si no tiene programa o no está. */
  async publishedMesocycle(
    patientId: string,
    position: number,
  ): Promise<{ lineageId: string; snapshot: ProgramSnapshot; mesocycle: ReportMesocycle } | null> {
    const published = await this.reviews.publishedProgramOf(patientId);
    const found = published ? await this.mesocycleOf(published.lineageId, position) : null;
    return published && found ? { lineageId: published.lineageId, ...found } : null;
  }

  async build(
    snapshot: ProgramSnapshot,
    mesocycle: ReportMesocycle,
    today: string,
  ): Promise<ReportBody> {
    const { patientId, lineageId } = snapshot;
    const until = minDate(mesocycle.endDate, today);
    const started = mesocycle.weeks.filter((week) => week.weekStart <= today);
    const reviews = await this.#weekReviews(lineageId, patientId, mesocycle);
    let numbers: ReportBody['numbers'] = null;
    let exerciseIds = new Set<string>();
    if (started.length > 0) {
      const source = this.sources.get();
      const lineage = new Set(
        (await this.programs.listByPatient(patientId))
          .filter((program) => program.lineageId === lineageId)
          .map((program) => program.id),
      );
      const workouts = await source.workouts(patientId, mesocycle.startDate, until);
      const exercises = exerciseOneRms(
        await source.oneRm(patientId, HISTORY_START, until),
        snapshot.oneRmFormula,
        mesocycle.startDate,
        until,
      );
      const run = runMethod(MESOCYCLE_REPORT_JV, {
        weeks: started.map((week) => {
          const review = reviews.get(week.weekNo);
          return {
            weekNo: week.weekNo,
            weekStart: week.weekStart,
            weekEnd: week.weekEnd,
            plannedSets: week.plannedSets,
            sessionsPlanned: week.sessionsPlanned,
            ...doneInWeek(workouts, lineage, week.weekNo),
            sleepHours: review?.aggregates?.avgSleepHours ?? null,
            stress: review?.avgStress ?? null,
            fatigue: review?.aggregates?.avgFatigue ?? null,
            performancePct: review?.aggregates?.avgPerformancePct ?? null,
            nutritionPct: review?.aggregates?.avgNutritionCompliancePct ?? null,
          };
        }),
        oneRmFormula: snapshot.oneRmFormula,
        exercises,
      });
      if (!run.ok) {
        throw new Error(
          `El informe del mesociclo no se calculó: ${run.errors.map((e) => e.code).join(', ')}`,
        );
      }
      numbers = run.result;
      exerciseIds = new Set(run.result.outputs.records.map((record) => record.exerciseId));
    }
    const evolution = await this.assessment.evolutionUntil(patientId, mesocycle.endDate);
    return {
      schemaVersion: MESOCYCLE_REPORT_SCHEMA_VERSION,
      computedOn: today,
      program: {
        programId: snapshot.programId,
        lineageId,
        versionNo: snapshot.versionNo,
        name: snapshot.name,
        oneRmFormula: snapshot.oneRmFormula,
        oneRmMethod: oneRmMethodOf(snapshot.oneRmFormula),
      },
      mesocycle: {
        position: mesocycle.position,
        name: mesocycle.name,
        startDate: mesocycle.startDate,
        endDate: mesocycle.endDate,
        weeks: mesocycle.weeks.map(({ weekNo, weekStart, weekEnd, isDeload }) => ({
          weekNo,
          weekStart,
          weekEnd,
          isDeload,
          started: weekStart <= today,
        })),
      },
      numbers,
      reviews: [...reviews.values()].map(({ review }) => review),
      exerciseNames: exerciseNamesOf(snapshot, exerciseIds),
      evolution: evolution ? comparisonOnly(evolution) : null,
    };
  }

  /** Los controles vigentes de las semanas del mesociclo, con los agregados del motor y el estrés de la semana. */
  async #weekReviews(lineageId: string, patientId: string, mesocycle: ReportMesocycle) {
    const weekNos = new Set(mesocycle.weeks.map((week) => week.weekNo));
    const current = (await this.reviews.listOfLineage(lineageId)).filter(
      (review) => review.status === 'CURRENT' && weekNos.has(review.weekNo),
    );
    const found = new Map<
      number,
      {
        review: ReportWeekReview;
        aggregates: {
          avgSleepHours: number | null;
          avgFatigue: number | null;
          avgPerformancePct: number | null;
          avgNutritionCompliancePct: number | null;
        } | null;
        avgStress: number | null;
      }
    >();
    for (const review of current.sort((a, b) => a.weekNo - b.weekNo)) {
      const run = runMethod(WEEKLY_REVIEW_JV, review.inputs as WeeklyReviewInput);
      found.set(review.weekNo, {
        review: {
          weekNo: review.weekNo,
          light: review.light,
          suggestedAction: review.suggestedAction,
          suggestedVolumeFactor: review.suggestedVolumeFactor,
          coachDecision: review.coachDecision,
          decidedVolumeFactor: review.decidedVolumeFactor,
          method: { code: review.methodCode, version: review.methodVersion },
        },
        aggregates: run.ok ? run.result.outputs.aggregates : null,
        avgStress: averageStress(
          await this.checkins.get().checkins(patientId, review.weekStart, review.weekEnd),
        ),
      });
    }
    return found;
  }
}
