import {
  PAL_RANGE,
  type CreateEnergyPrescription,
  type EnergyPrescriptionPreview,
  type RmrMethod,
} from '@nutricoach/contracts';
import { parseDecimal } from '@nutricoach/ui';
import { ADJUSTMENT_OPTIONS, type AdjustmentOption } from './labels';

export interface ActivityDraft {
  readonly activityCode: string;
  readonly descriptionEs: string;
  readonly met: number;
  readonly minutes: string;
  readonly sessions: string;
}

export interface PrescriptionDraft {
  readonly evaluationId: string;
  readonly rmrMethodCode: RmrMethod;
  readonly strategy: EnergyPrescriptionPreview['strategy'];
  readonly pal: string;
  readonly activities: readonly ActivityDraft[];
  readonly goal: EnergyPrescriptionPreview['goal'];
  readonly adjustment: AdjustmentOption;
  readonly amount: string;
  readonly targetFatPct: string;
  readonly proteinGPerKg: string;
  readonly fatPctKcal: string;
}

const positive = (text: string): number | null => {
  const value = parseDecimal(text);
  return value !== null && value > 0 ? value : null;
};

/**
 * El cuerpo de la prescripción a partir del formulario (RN-E02 a RN-E07), o null mientras falte algo o algo esté fuera
 * de rango: entonces no se pide la vista previa. La cantidad del ajuste se escribe en positivo y el signo sale de la
 * opción: «Perder grasa: kg por mes» con 3 es −3 kg de grasa al mes (G-16). Con la estrategia factorial el ejercicio
 * ya está en el PAL y no se mandan actividades.
 */
export function prescriptionBody(draft: PrescriptionDraft): CreateEnergyPrescription | null {
  const pal = parseDecimal(draft.pal);
  if (pal === null || pal < PAL_RANGE[0] || pal > PAL_RANGE[1]) return null;
  const protein = positive(draft.proteinGPerKg);
  const fat = positive(draft.fatPctKcal);
  if (protein === null || protein > 10 || fat === null || fat >= 100) return null;
  const option = ADJUSTMENT_OPTIONS[draft.adjustment];
  const amount = option.sign === 0 ? 0 : parseDecimal(draft.amount);
  if (amount === null || amount < 0) return null;
  const signed = option.sign * amount + 0;
  let targetFatPct: number | null = null;
  if (draft.targetFatPct.trim() !== '') {
    targetFatPct = positive(draft.targetFatPct);
    if (targetFatPct === null || targetFatPct >= 100) return null;
  }
  const activities =
    draft.strategy === 'ADDITIVE'
      ? draft.activities.map((activity) => ({
          activityCode: activity.activityCode,
          minutesPerSession: positive(activity.minutes),
          sessionsPerWeek: positive(activity.sessions),
        }))
      : [];
  if (activities.some((a) => a.minutesPerSession === null || a.sessionsPerWeek === null))
    return null;
  return {
    evaluationId: draft.evaluationId,
    rmrMethodCode: draft.rmrMethodCode,
    strategy: draft.strategy,
    pal,
    activities: activities.map((a) => ({
      activityCode: a.activityCode,
      minutesPerSession: a.minutesPerSession ?? 0,
      sessionsPerWeek: a.sessionsPerWeek ?? 0,
    })),
    goal: draft.goal,
    adjustment:
      option.kind === 'FAT_KG_PER_MONTH'
        ? { kind: 'FAT_KG_PER_MONTH', fatKgPerMonth: signed }
        : { kind: 'KCAL_PER_DAY', kcalPerDay: signed },
    targetFatPct,
    proteinGPerKg: protein,
    fatPctKcal: fat,
  };
}
