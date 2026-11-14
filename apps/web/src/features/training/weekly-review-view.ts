import type { TrainingWeek, WeeklyReview } from '@nutricoach/contracts';

/** Una semana cerrada ya se controla; la que corre todavía no; las siguientes, por delante (07 §10). */
export type WeekState = 'CLOSED' | 'CURRENT' | 'UPCOMING';

export function weekState(weekStart: string, weekEnd: string, today: string): WeekState {
  if (weekEnd < today) return 'CLOSED';
  return weekStart <= today ? 'CURRENT' : 'UPCOMING';
}

/** Una semana del macrociclo en el resumen del coach (07 §10). */
export interface MacrocycleRow {
  readonly weekNo: number;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly phase: string | null;
  readonly isDeload: boolean;
  readonly state: WeekState;
  /** El factor con que se controló la semana o, sin control, el de la versión vigente del programa. */
  readonly plannedFactor: number | null;
  /** El control vigente de la semana, si ya se calculó. */
  readonly review: WeeklyReview | null;
  readonly sessionsPlanned: number;
  /** Las sesiones que registró el paciente; null si la semana no empezó. */
  readonly sessionsDone: number | null;
}

/**
 * Las semanas del programa vigente con su control: lo programado sale de la analítica de rutina y lo controlado, de los
 * controles de la línea del programa, por número de semana (RN-F12: las versiones comparten las semanas).
 */
export function macrocycleRows(
  weeks: readonly TrainingWeek[],
  reviews: readonly WeeklyReview[],
  today: string,
): MacrocycleRow[] {
  const byWeek = new Map(reviews.map((review) => [review.weekNo, review]));
  return weeks.map((week) => {
    const review = byWeek.get(week.weekNo) ?? null;
    return {
      weekNo: week.weekNo,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      phase: week.phase,
      isDeload: week.isDeload,
      state: weekState(week.weekStart, week.weekEnd, today),
      plannedFactor: review?.plannedVolumeFactor ?? week.volumeFactor,
      review,
      sessionsPlanned: week.sessionsPlanned,
      sessionsDone: week.sessionsDone,
    };
  });
}

/**
 * Las sesiones del macrociclo (07 §10): las que registró el paciente, las programadas hasta hoy y las próximas. Las
 * verificadas y por validar salen de la asistencia a las citas de la agenda (trainingAttendance, ADR-125).
 */
export function sessionSummary(rows: readonly MacrocycleRow[]): {
  readonly registered: number;
  readonly programmedToDate: number;
  readonly upcoming: number;
} {
  let registered = 0;
  let programmedToDate = 0;
  let upcoming = 0;
  for (const row of rows) {
    if (row.state === 'UPCOMING') {
      upcoming += row.sessionsPlanned;
      continue;
    }
    const done = row.sessionsDone ?? 0;
    registered += done;
    programmedToDate += row.sessionsPlanned;
    if (row.state === 'CURRENT') upcoming += Math.max(0, row.sessionsPlanned - done);
  }
  return { registered, programmedToDate, upcoming };
}

/**
 * La semana que se abre: la pedida, si tiene control; si no, la última sin decidir; si no, la última controlada. Sin
 * controles, ninguna.
 */
export function selectedWeekNo(
  rows: readonly MacrocycleRow[],
  requested: string | string[] | undefined,
): number | null {
  const reviewed = rows.filter((row) => row.review !== null);
  const asked = typeof requested === 'string' ? Number(requested) : Number.NaN;
  const pick =
    reviewed.find((row) => row.weekNo === asked) ??
    reviewed.findLast((row) => row.review?.decision === null) ??
    reviewed.at(-1);
  return pick?.weekNo ?? null;
}

/**
 * El factor que el formulario propone al ajustar o descargar: el sugerido por el motor redondeado a 2 decimales, con el
 * medio hacia arriba (0.825 → 0.83), porque la semana guarda 2 (ADR-090). Redondea en decimal: en binario 0.945 es
 * 0.94499…, y Math.round(0.945 × 100) daría 0.94.
 */
export function roundFactor(value: number): number {
  return Number(`${String(Math.round(Number(`${value.toPrecision(12)}e2`)))}e-2`);
}

/** El factor que el programa vigente tiene para la semana siguiente; `exists` es false si la controlada era la última. */
export function nextWeekPlan(
  weeks: readonly TrainingWeek[],
  weekNo: number,
): { readonly exists: boolean; readonly factor: number | null } {
  const next = weeks.find((week) => week.weekNo === weekNo + 1);
  return { exists: next !== undefined, factor: next?.volumeFactor ?? null };
}

const FACTOR = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

/** Un factor de volumen como en la tabla de fases (0.90) y con el tercer decimal del ajuste si lo tiene (0.825). */
export function formatFactor(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : FACTOR.format(value);
}
