import { domainError, type DomainError } from '@nutricoach/shared-kernel';
import { isClosed, weekDates } from './weekly-review.js';

/**
 * El informe de un mesociclo (P14.5, PR 7; P-28 y P-29, respuestas de Rodrigo del 2026-11-10 y del 2026-11-11; RN-G19): uno por
 * mesociclo de la línea del programa. El coach escribe el logro, la limitante, el ajuste y la prioridad en el borrador, y lo envía
 * cuando cierra la última semana del mesociclo (la cuarta en los de JV Fitness). Enviado es final: los números quedan congelados y
 * solo cambia el comentario del alumno, que lo escribe desde su app. Puro.
 */

export type MesocycleReportStatus = 'DRAFT' | 'SENT';

/** Lo que escribe el coach (P-28): «Logro principal», «Limitante», «Ajuste principal» y «Prioridad siguiente». */
export interface MesocycleReportTexts {
  readonly achievement: string | null;
  readonly limitation: string | null;
  readonly adjustment: string | null;
  readonly priority: string | null;
}

export interface MesocycleReportRecord extends MesocycleReportTexts {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly programLineageId: string;
  /** El mesociclo, por su posición en la línea del programa: las versiones nuevas conservan la estructura (RN-F17). */
  readonly mesocyclePosition: number;
  readonly status: MesocycleReportStatus;
  readonly studentComment: string | null;
  readonly studentCommentedAt: Date | null;
  /** Lo que congeló enviarlo; null en borrador. */
  readonly snapshot: unknown;
  readonly sentAt: Date | null;
  /** El miembro del equipo que lo envió. */
  readonly sentBy: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** El largo máximo de cada texto del coach y del comentario del alumno. */
export const REPORT_TEXT_MAX_LENGTH = 1000;

export const REPORT_NOT_FOUND = domainError({
  code: 'NC-TRA-029',
  rule: 'RN-G19',
  message: 'Ese informe no existe para este alumno.',
});

export const REPORT_EXISTS = domainError({
  code: 'NC-TRA-030',
  rule: 'RN-G19',
  message: 'Ese mesociclo ya tiene su informe: ábrelo para seguir.',
});

export const REPORT_MESOCYCLE_NOT_FOUND = domainError({
  code: 'NC-TRA-031',
  rule: 'RN-G19',
  message: 'Ese mesociclo no está en el programa publicado del alumno.',
});

export const REPORT_NOT_CLOSED = domainError({
  code: 'NC-TRA-032',
  rule: 'RN-G19',
  message: 'El informe se envía cuando cierra la última semana del mesociclo.',
});

export const REPORT_ALREADY_SENT = domainError({
  code: 'NC-TRA-033',
  rule: 'RN-G19',
  message: 'Este informe ya se envió: no se cambia.',
});

export const REPORT_TEXTS_REQUIRED = domainError({
  code: 'NC-TRA-034',
  rule: 'RN-G19',
  message: 'Para enviarlo, escribe el logro, la limitante, el ajuste y la prioridad.',
});

export const REPORT_VERSION_CONFLICT = domainError({
  code: 'NC-TRA-035',
  message: 'Alguien cambió este informe mientras lo editabas. Vuelve a cargarlo.',
});

/** Un texto sin espacios de más; vacío es «sin escribir». */
const clean = (text: string | null): string | null => {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const cleanTexts = (texts: MesocycleReportTexts): MesocycleReportTexts => ({
  achievement: clean(texts.achievement),
  limitation: clean(texts.limitation),
  adjustment: clean(texts.adjustment),
  priority: clean(texts.priority),
});

export const cleanComment = (comment: string | null): string | null => clean(comment);

/** El borrador se edita; un informe enviado, no (RN-G19). */
export const editProblem = (report: Pick<MesocycleReportRecord, 'status'>): DomainError | null =>
  report.status === 'SENT' ? REPORT_ALREADY_SENT : null;

/** Lo que impide enviarlo: que ya se envió, que el mesociclo no cerró o que falta un texto. */
export function sendProblem(
  report: Pick<MesocycleReportRecord, 'status'> & MesocycleReportTexts,
  closed: boolean,
): DomainError | null {
  if (report.status === 'SENT') return REPORT_ALREADY_SENT;
  if (!closed) return REPORT_NOT_CLOSED;
  const texts = cleanTexts(report);
  if (Object.values(texts).some((text) => text === null)) return REPORT_TEXTS_REQUIRED;
  return null;
}

// ─── El mesociclo en el programa y lo que se hizo ───────────────────────────────────────────────────────────────

/** El grupo muscular del cardio: va en minutos, no en series (ADR-071). */
export const CARDIO_MUSCLE = 'CARDIO';

/** Lo que se usa del snapshot del programa, en tipos estructurales (02 §4). */
export interface ReportProgramSource {
  /** YYYY-MM-DD: el primer día de la semana 1. */
  readonly startDate: string;
  readonly mesocycles: readonly {
    readonly position: number;
    readonly name: string;
    readonly weeks: readonly {
      readonly weekNo: number;
      readonly isDeload: boolean;
      readonly sessions: readonly {
        readonly exercises: readonly {
          readonly primaryMuscles: readonly { readonly code: string }[];
          readonly secondaryMuscles: readonly { readonly code: string }[];
          readonly sets: readonly { readonly setType: string }[];
        }[];
      }[];
    }[];
  }[];
}

export interface ReportPlannedWeek {
  readonly weekNo: number;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly isDeload: boolean;
  /** Las series de la rutina completa de la semana, sin calentamiento ni cardio (P-29). */
  readonly plannedSets: number;
  readonly sessionsPlanned: number;
}

export interface ReportMesocycle {
  readonly position: number;
  readonly name: string;
  readonly weeks: readonly ReportPlannedWeek[];
  /** El primer día de la primera semana y el último de la última. */
  readonly startDate: string;
  readonly endDate: string;
}

const isCardio = (exercise: {
  readonly primaryMuscles: readonly { readonly code: string }[];
  readonly secondaryMuscles: readonly { readonly code: string }[];
}): boolean =>
  [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some(
    (muscle) => muscle.code === CARDIO_MUSCLE,
  );

/** El mesociclo de esa posición con sus semanas, sus fechas y lo planificado; null si el programa no lo tiene. */
export function reportMesocycle(
  program: ReportProgramSource,
  position: number,
): ReportMesocycle | null {
  const mesocycle = program.mesocycles.find((candidate) => candidate.position === position);
  if (!mesocycle || mesocycle.weeks.length === 0) return null;
  const weeks = [...mesocycle.weeks]
    .sort((a, b) => a.weekNo - b.weekNo)
    .map((week): ReportPlannedWeek => {
      const { weekStart, weekEnd } = weekDates(program.startDate, week.weekNo);
      return {
        weekNo: week.weekNo,
        weekStart,
        weekEnd,
        isDeload: week.isDeload,
        plannedSets: week.sessions
          .flatMap((session) => session.exercises)
          .filter((exercise) => !isCardio(exercise))
          .flatMap((exercise) => exercise.sets)
          .filter((set) => set.setType !== 'WARMUP').length,
        sessionsPlanned: week.sessions.length,
      };
    });
  const [first] = weeks as [ReportPlannedWeek, ...ReportPlannedWeek[]];
  const last = weeks.at(-1) as ReportPlannedWeek;
  return {
    position: mesocycle.position,
    name: mesocycle.name,
    weeks,
    startDate: first.weekStart,
    endDate: last.weekEnd,
  };
}

/** El mesociclo cerró cuando su último día ya pasó en la fecha local del alumno, como el control semanal (07 §10). */
export const mesocycleClosed = (mesocycle: Pick<ReportMesocycle, 'endDate'>, today: string) =>
  isClosed(mesocycle.endDate, today);

/** Un entreno registrado, como lo usa el informe; lo da tracking con los ajustes del profesional aplicados (RN-G02). */
export interface ReportWorkout {
  readonly outcome: 'COMPLETED' | 'PARTIAL' | 'SKIPPED';
  readonly programId: string | null;
  /** La semana del programa de la sesión: una sesión cuenta en su semana aunque se haga otro día (ADR-083). */
  readonly weekNo: number | null;
  readonly sets: readonly { readonly isWarmup: boolean; readonly isCardio: boolean }[];
}

/** Las sesiones hechas y sus series de una semana, de los entrenos de la línea del programa: sin calentamiento ni cardio. */
export function doneInWeek(
  workouts: readonly ReportWorkout[],
  lineageProgramIds: ReadonlySet<string>,
  weekNo: number,
): { readonly sessionsDone: number; readonly doneSets: number } {
  const done = workouts.filter(
    (workout) =>
      workout.outcome !== 'SKIPPED' &&
      workout.weekNo === weekNo &&
      workout.programId !== null &&
      lineageProgramIds.has(workout.programId),
  );
  return {
    sessionsDone: done.length,
    doneSets: done
      .flatMap((workout) => workout.sets)
      .filter((set) => !set.isWarmup && !set.isCardio).length,
  };
}
