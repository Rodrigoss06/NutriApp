import { Inject, Injectable } from '@nestjs/common';
import {
  ADJUSTED_VOLUME,
  COMPLIANCE,
  READINESS_JV,
  RPE_FROM_RIR,
  runMethod,
  SFR,
  TONNAGE,
} from '@nutricoach/engine';
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
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import { TrackingApi } from '../../../tracking/index.js';
import { TrainingApi, type ProgramSnapshot } from '../../../training/index.js';
import { PROGRAM_NOT_FOUND } from '../../domain/analytics-errors.js';
import type { DailySummary } from '../../domain/daily-summary.js';
import type { OneRmPoint } from '../../domain/one-rm.js';
import { programCalendar, type CalendarWeek } from '../../domain/program-calendar.js';
import { localDateIn } from '../local-date.js';
import { oneRmMethod } from '../one-rm-estimate.js';
import {
  ANALYTICS_STORE,
  type AnalyticsStore,
  type WeeklyMuscleRow,
} from '../ports/analytics.ports.js';

interface MethodRef {
  readonly code: string;
  readonly version: string;
}

export interface TrainingMuscleWeekView {
  readonly muscleCode: string;
  readonly setsPlanned: number | null;
  readonly setsDone: number;
  readonly compliancePct: number;
  readonly tonnageKg: number | null;
  readonly adjustedVolumeKg: number | null;
  readonly unfactoredSets: number | null;
  readonly avgRpe: number | null;
  readonly avgStimulus: number | null;
  readonly avgFatigue: number | null;
  readonly sfr: number | null;
}

export interface TrainingWeekView {
  readonly weekNo: number;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly mesocycleId: string;
  readonly isDeload: boolean;
  readonly phase: string | null;
  readonly volumeFactor: number | null;
  readonly targetRir: number | null;
  readonly started: boolean;
  readonly sessionsPlanned: number;
  readonly sessionsDone: number | null;
  readonly sessionsCompliancePct: number | null;
  readonly tonnageKg: number | null;
  readonly adjustedVolumeKg: number | null;
  readonly unfactoredSets: number | null;
  readonly srpeLoad: number | null;
  readonly cardioMinutesPlanned: number;
  readonly cardioMinutesDone: number | null;
  readonly cardioCompliancePct: number | null;
  readonly muscles: readonly TrainingMuscleWeekView[];
}

export interface TrainingAnalyticsView {
  readonly program: {
    readonly programId: string;
    readonly lineageId: string;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly totalWeeks: number;
    readonly oneRmFormula: string;
  } | null;
  readonly methods: {
    readonly tonnage: MethodRef;
    readonly adjustedVolume: MethodRef;
    readonly fractionalSets: MethodRef;
    readonly compliance: MethodRef;
    readonly sfr: MethodRef;
    readonly rpe: MethodRef;
    readonly srpe: MethodRef;
  };
  readonly mesocycles: readonly {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly focus: string | null;
  }[];
  readonly weeks: readonly TrainingWeekView[];
  readonly oneRm: readonly {
    readonly exerciseId: string;
    readonly exerciseName: string;
    readonly formula: string;
    readonly method: MethodRef | null;
    readonly points: readonly { readonly localDate: string; readonly estimated1rmKg: number }[];
  }[];
}

const ref = (method: MethodRef): MethodRef => ({ code: method.code, version: method.version });

/** Cumplimiento con el motor (RN-F09): realizado ÷ prescrito × 100; 0 sin prescripción. */
const compliance = (done: number, planned: number): number => {
  const run = runMethod(COMPLIANCE, { done, planned });
  return run.ok ? run.result.outputs.compliancePct : 0;
};

const sumOf = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
};

/** Los días del resumen dentro de la semana del calendario, por fecha (07 §10). */
const daysIn = (days: readonly DailySummary[], week: CalendarWeek) =>
  days.filter((day) => day.localDate >= week.weekStart && day.localDate <= week.weekEnd);

function weekView(
  week: CalendarWeek,
  today: string,
  days: readonly DailySummary[],
  muscles: readonly WeeklyMuscleRow[],
): TrainingWeekView {
  const started = week.weekStart <= today;
  const inWeek = daysIn(days, week);
  const sessionsDone = started ? inWeek.reduce((total, day) => total + day.workoutsDone, 0) : null;
  const cardioDone = started ? (sumOf(inWeek.map((day) => day.cardioMinutes)) ?? 0) : null;
  return {
    weekNo: week.weekNo,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    mesocycleId: week.mesocycleId,
    isDeload: week.isDeload,
    phase: week.phaseEs,
    volumeFactor: week.volumeFactor,
    targetRir: week.targetRir,
    started,
    sessionsPlanned: week.sessionsPlanned,
    sessionsDone,
    sessionsCompliancePct:
      sessionsDone === null ? null : compliance(sessionsDone, week.sessionsPlanned),
    tonnageKg: started ? sumOf(inWeek.map((day) => day.tonnageKg)) : null,
    adjustedVolumeKg: started ? sumOf(inWeek.map((day) => day.adjustedVolumeKg)) : null,
    unfactoredSets: started ? sumOf(inWeek.map((day) => day.unfactoredSets)) : null,
    srpeLoad: started ? sumOf(inWeek.map((day) => day.srpeLoad)) : null,
    cardioMinutesPlanned: week.cardioMinutesPlanned,
    cardioMinutesDone: cardioDone,
    cardioCompliancePct:
      cardioDone === null ? null : compliance(cardioDone, week.cardioMinutesPlanned),
    muscles: muscles
      .filter((row) => row.weekStart === week.weekStart)
      .map((row) => ({
        muscleCode: row.muscleCode,
        setsPlanned: row.fractionalSetsPlanned,
        setsDone: row.fractionalSetsDone,
        compliancePct: compliance(row.fractionalSetsDone, row.fractionalSetsPlanned ?? 0),
        tonnageKg: row.tonnageKg,
        adjustedVolumeKg: row.adjustedVolumeKg,
        unfactoredSets: row.unfactoredSets,
        avgRpe: row.avgRpe,
        avgStimulus: row.avgStimulus,
        avgFatigue: row.avgFatigue,
        sfr: row.sfr,
      })),
  };
}

/** Los nombres de los ejercicios del programa: el 1RM se muestra con el nombre que tenía al publicarse (RN-F12). */
function exerciseNames(snapshot: ProgramSnapshot): Map<string, string> {
  const names = new Map<string, string>();
  for (const mesocycle of snapshot.mesocycles) {
    for (const week of mesocycle.weeks) {
      for (const session of week.sessions) {
        for (const exercise of session.exercises) names.set(exercise.exerciseId, exercise.name);
      }
    }
  }
  return names;
}

function oneRmSeries(points: readonly OneRmPoint[], names: ReadonlyMap<string, string>) {
  const series = new Map<string, OneRmPoint[]>();
  for (const point of points) {
    const key = `${point.exerciseId}|${point.formula}`;
    series.set(key, [...(series.get(key) ?? []), point]);
  }
  return [...series.values()].map((items) => {
    const [first] = items as [OneRmPoint, ...OneRmPoint[]];
    return {
      exerciseId: first.exerciseId,
      exerciseName: names.get(first.exerciseId) ?? 'Ejercicio',
      formula: first.formula,
      method: oneRmMethod(first.formula),
      points: items.map((item) => ({
        localDate: item.localDate,
        estimated1rmKg: item.bestEstimated1rmKg,
      })),
    };
  });
}

/**
 * La analítica de rutina del paciente para su equipo (RF-33): el macrociclo de un programa (el vigente si no se pide otro), semana a
 * semana y por mesociclo, con las descargas marcadas (RN-F08). Lee los read models, el snapshot del programa y nada más (05 §1),
 * con la RLS del equipo de atención (RN-A05). La lectura queda en la auditoría (RN-B03).
 */
@Injectable()
export class TrainingQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(TrainingApi) private readonly programs: TrainingApi,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  training(
    context: SecurityContext,
    patientId: string,
    programId: string | null,
  ): Promise<Result<TrainingAnalyticsView, DomainError>> {
    return this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      const requested = programId ?? (await this.tracking.activeProgramId(patientId));
      const published = requested === null ? null : await this.programs.publishedProgram(requested);
      if (programId !== null && published?.patientId !== patientId) return err(PROGRAM_NOT_FOUND);
      const snapshot =
        published && published.patientId === patientId
          ? ((await this.programs.latestPublishedOfLineage(published.lineageId)) ?? published)
          : null;
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'analytics.patient_weekly_muscle_volume',
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      const methods = {
        tonnage: ref(TONNAGE),
        adjustedVolume: ref(ADJUSTED_VOLUME),
        fractionalSets: snapshot
          ? ref(snapshot.setsMethod)
          : { code: 'FRACTIONAL_SETS', version: '1.0.0' },
        compliance: ref(COMPLIANCE),
        sfr: ref(SFR),
        rpe: ref(RPE_FROM_RIR),
        srpe: ref(READINESS_JV),
      };
      if (!snapshot) return ok({ program: null, methods, mesocycles: [], weeks: [], oneRm: [] });
      const today = localDateIn(this.clock.now(), patient.timezone);
      const until = snapshot.endDate < today ? snapshot.endDate : today;
      const days =
        snapshot.startDate <= until
          ? await this.store.dailySummaries(patientId, snapshot.startDate, until)
          : [];
      const muscles = await this.store.weeklyVolume(
        patientId,
        snapshot.startDate,
        snapshot.endDate,
      );
      const points = await this.store.oneRmSeries(patientId, snapshot.startDate, snapshot.endDate);
      return ok({
        program: {
          programId: snapshot.programId,
          lineageId: snapshot.lineageId,
          name: snapshot.name,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
          totalWeeks: snapshot.totalWeeks,
          oneRmFormula: snapshot.oneRmFormula,
        },
        methods,
        mesocycles: snapshot.mesocycles.map((mesocycle) => ({
          id: mesocycle.id,
          position: mesocycle.position,
          name: mesocycle.name,
          focus: mesocycle.focus,
        })),
        weeks: programCalendar(snapshot).map((week) => weekView(week, today, days, muscles)),
        oneRm: oneRmSeries(points, exerciseNames(snapshot)),
      });
    });
  }
}
