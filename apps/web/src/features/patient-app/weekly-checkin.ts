import type { MeWeeklyCheckin } from '@nutricoach/contracts';
import { formatDate } from '@/lib/dates';

/** Lo que queda escrito en el formulario del check-in de la semana (P-21, ADR-109). */
export interface WeeklyCheckinValues {
  readonly nutritionCompliancePct: number | null;
  readonly bodyWeightKg: number | null;
  readonly comment: string;
}

export interface WeeklyCheckinProblems {
  readonly nutritionCompliancePct?: string;
  readonly bodyWeightKg?: string;
}

/** La alimentación es obligatoria, de 0 a 100 sin decimales; el peso, si lo escribe, de 20 a 300 kg (RN-C04). */
export function weeklyCheckinProblems(values: WeeklyCheckinValues): WeeklyCheckinProblems {
  const pct = values.nutritionCompliancePct;
  const weight = values.bodyWeightKg;
  return {
    ...(pct === null || !Number.isInteger(pct) || pct < 0 || pct > 100
      ? { nutritionCompliancePct: 'Escribe de 0 a 100 %, sin decimales.' }
      : {}),
    ...(weight !== null && (weight < 20 || weight > 300)
      ? { bodyWeightKg: 'Escribe un peso entre 20 y 300 kg, o déjalo vacío.' }
      : {}),
  };
}

/** El cuerpo del POST: sin peso si la app no lo pide, y sin comentario si quedó vacío. */
export function weeklyCheckinBody(
  checkin: MeWeeklyCheckin,
  values: WeeklyCheckinValues,
  clientId: string,
) {
  const comment = values.comment.trim();
  return {
    clientId,
    weekDate: checkin.weekDate,
    nutritionCompliancePct: values.nutritionCompliancePct ?? 0,
    bodyWeightKg: checkin.asksWeight ? values.bodyWeightKg : null,
    comment: comment === '' ? null : comment,
  };
}

/** «Se completa hasta el martes 17 de noviembre de 2026»: el último día del plazo. */
export const closesText = (checkin: MeWeeklyCheckin): string =>
  `Se completa hasta el martes ${formatDate(checkin.closesOn)}.`;
