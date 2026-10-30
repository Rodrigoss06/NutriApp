import type { ProposalDay, RoutineProposal } from './routine-proposal.js';

/** Las cuatro tablas de fases (07 §7): el objetivo del perfil elige una. */
export const TRAINING_OBJECTIVES = ['FAT_LOSS', 'HYPERTROPHY', 'STRENGTH', 'HEALTH'] as const;
export type TrainingObjective = (typeof TRAINING_OBJECTIVES)[number];

export const TRAINING_INTENSITIES = [
  'LOW',
  'LOW_MODERATE',
  'MODERATE',
  'MODERATE_HIGH',
  'HIGH',
  'VERY_HIGH',
] as const;
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number];

/** «Seguimiento diario» o «Control y ajuste» (semanas 4, 8 y 12). */
export const REVIEW_KINDS = ['DAILY', 'CONTROL'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Una fila de training.periodization_phase: el motor la recibe, la tabla es un dato versionado (RN-F13). */
export interface PeriodizationPhase {
  readonly objective: TrainingObjective;
  readonly weekNo: number;
  readonly phaseEs: string;
  readonly phaseGoalEs: string;
  readonly volumeFactor: number;
  readonly intensity: TrainingIntensity;
  readonly targetRir: number;
  readonly isDeload: boolean;
  readonly reviewKind: ReviewKind;
}

export const MACROCYCLE_MIN_WEEKS = 8;
export const MACROCYCLE_MAX_WEEKS = 12;

/**
 * El macrociclo toma las primeras semanas de la tabla de su objetivo (RN-F13): con menos de 12 se corta, como la V3
 * (P-07), y el coach edita las semanas. Falla si la tabla no las tiene: una tabla a medias es un error de datos.
 */
export function macrocycleWeeks(
  table: readonly PeriodizationPhase[],
  objective: TrainingObjective,
  weeks: number,
): readonly PeriodizationPhase[] {
  if (!Number.isInteger(weeks) || weeks < MACROCYCLE_MIN_WEEKS || weeks > MACROCYCLE_MAX_WEEKS) {
    throw new RangeError(`Un macrociclo tiene de 8 a 12 semanas, no ${String(weeks)}.`);
  }
  const selected = table
    .filter((phase) => phase.objective === objective)
    .sort((a, b) => a.weekNo - b.weekNo)
    .slice(0, weeks);
  if (selected.length !== weeks || selected.some((phase, index) => phase.weekNo !== index + 1)) {
    throw new RangeError(
      `La tabla de fases de ${objective} no tiene las ${String(weeks)} semanas.`,
    );
  }
  return selected;
}

export interface MesocycleRange {
  readonly firstWeek: number;
  readonly lastWeek: number;
}

/**
 * Los mesociclos de un programa de la V3 (05.2): cada uno termina en una semana de descarga y las semanas que siguen a
 * la última forman el último (1 a 5, 6 a 9 y 10 a 12 en las cuatro tablas).
 */
export function macrocycleMesocycles(
  weeks: readonly Pick<PeriodizationPhase, 'weekNo' | 'isDeload'>[],
): readonly MesocycleRange[] {
  const ranges: MesocycleRange[] = [];
  let firstWeek: number | null = null;
  for (const { weekNo, isDeload } of weeks) {
    firstWeek ??= weekNo;
    if (isDeload || weekNo === weeks.at(-1)?.weekNo) {
      ranges.push({ firstWeek, lastWeek: weekNo });
      firstWeek = null;
    }
  }
  return ranges;
}

/** Series de la semana = series base × factor, redondeado y con mínimo 1; el coach lo ajusta (P-06). */
export const weekSets = (baseSets: number, volumeFactor: number): number =>
  Math.max(1, Math.round(baseSets * volumeFactor));

export interface ProposalWeek<T> {
  readonly week: PeriodizationPhase;
  readonly days: readonly ProposalDay<T>[];
}

/**
 * Una semana del macrociclo con los bloques de la propuesta: las series según su factor (P-06) y el RIR de cada serie,
 * el objetivo de la semana. Los demás valores son los de la plantilla, que conserva su RIR base.
 */
export function proposalWeek<T>(
  proposal: RoutineProposal<T>,
  week: PeriodizationPhase,
): ProposalWeek<T> {
  return {
    week,
    days: proposal.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({
        ...block,
        sets: weekSets(block.sets, week.volumeFactor),
        loadValue: week.targetRir,
      })),
    })),
  };
}
