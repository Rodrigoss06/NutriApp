import {
  formatNumber,
  WEEKLY_ACTION_TEXTS,
  type MesocycleReport,
  type MesocycleReportBody,
  type MesocycleReportsResponse,
} from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';
import { weekLabel } from '@/features/analytics/diet-view';
import { COACH_DECISION_LABELS } from './labels';

/** Los estados del informe (RN-G19): Borrador mientras el coach escribe; Enviado es final. */
export const REPORT_STATUS_LABELS = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
} as const satisfies Record<MesocycleReport['status'], string>;

export const REPORT_STATUS_TONES = {
  DRAFT: 'info',
  SENT: 'success',
} as const satisfies Record<MesocycleReport['status'], Tone>;

type Numbers = NonNullable<MesocycleReportBody['numbers']>;
type Review = MesocycleReportBody['reviews'][number];

const dash = '—';

/** Un porcentaje redondeado al presentar (RN-D09); sin dato, una raya. */
export const percentText = (value: number | null): string =>
  value === null ? dash : `${formatNumber(value, 'percent')} %`;

/** Un promedio del registro diario: horas de sueño, o estrés y fatiga de 1 a 5. */
export const averageText = (value: number | null, unit: 'h' | '/ 5'): string =>
  value === null ? dash : `${formatNumber(value, 'index')} ${unit}`;

export const kgText = (value: number): string => `${formatNumber(value, 'mass')} kg`;

/** Las cifras de arriba del informe, como el «Resumen ejecutivo» de la hoja (P-29). */
export function summaryTiles(numbers: Numbers): readonly {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}[] {
  const { total, averages } = numbers;
  return [
    {
      key: 'volume',
      label: 'Volumen cumplido',
      value: percentText(total.volumePct),
      detail: `${String(total.doneSets)} de ${String(total.plannedSets)} series`,
    },
    {
      key: 'sessions',
      label: 'Sesiones',
      value: `${String(total.sessionsDone)} de ${String(total.sessionsPlanned)}`,
    },
    {
      key: 'records',
      label: 'Récords',
      value: String(total.records),
      detail: 'Un 1RM estimado más alto que el mejor anterior',
    },
    { key: 'sleep', label: 'Sueño promedio', value: averageText(averages.sleepHours, 'h') },
    { key: 'stress', label: 'Estrés promedio', value: averageText(averages.stress, '/ 5') },
    { key: 'fatigue', label: 'Fatiga promedio', value: averageText(averages.fatigue, '/ 5') },
    { key: 'performance', label: 'Rendimiento', value: percentText(averages.performancePct) },
    { key: 'nutrition', label: 'Alimentación', value: percentText(averages.nutritionPct) },
  ];
}

export interface ReportWeekRow {
  readonly weekNo: number;
  readonly label: string;
  readonly isDeload: boolean;
  readonly started: boolean;
  readonly week: Numbers['weeks'][number] | null;
  readonly review: Review | null;
  /** «Continuar plan», «Descarga 20–30 % y revisar»… del control semanal (07 §10). */
  readonly action: string | null;
  readonly decision: string | null;
}

/** Cada semana del mesociclo con lo suyo del motor y de su control; una semana que no empezó, sin cifras. */
export function reportWeekRows(body: MesocycleReportBody): readonly ReportWeekRow[] {
  return body.mesocycle.weeks.map((week) => {
    const review = body.reviews.find((r) => r.weekNo === week.weekNo) ?? null;
    return {
      weekNo: week.weekNo,
      label: `Semana ${String(week.weekNo)} · ${weekLabel(week.weekStart, week.weekEnd)}`,
      isDeload: week.isDeload,
      started: week.started,
      week: body.numbers?.weeks.find((w) => w.weekNo === week.weekNo) ?? null,
      review,
      action: review ? WEEKLY_ACTION_TEXTS[review.suggestedAction] : null,
      decision: review?.coachDecision ? COACH_DECISION_LABELS[review.coachDecision] : null,
    };
  });
}

/** Un mesociclo de la lista: si cerró, si está en curso o si todavía no empieza. */
export function mesocycleMoment(
  mesocycle: MesocycleReportsResponse['mesocycles'][number],
  today: string,
): 'CLOSED' | 'CURRENT' | 'UPCOMING' {
  if (mesocycle.closed) return 'CLOSED';
  return mesocycle.startDate <= today ? 'CURRENT' : 'UPCOMING';
}

export const MESOCYCLE_MOMENT_LABELS = {
  CLOSED: 'Cerrado',
  CURRENT: 'En curso',
  UPCOMING: 'Por empezar',
} as const;
