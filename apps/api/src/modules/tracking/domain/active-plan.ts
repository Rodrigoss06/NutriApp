/** La meta de un día (05.2, tracking.daily_target): la del plan vigente ese día (RN-G03). */
export interface DailyTarget {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly waterMl: number | null;
}

/** El tipo de un día según el programa vigente (07 §8): con sesiones programadas, de entrenamiento; si no, de descanso. */
export type DayKind = 'TRAINING' | 'REST';

interface Macros {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

/** Lo que la meta toma del snapshot del plan publicado. */
export interface PlanTargets {
  /** Las de la prescripción: las del día de entrenamiento si el plan tiene metas de descanso (07 §2). */
  readonly targets: Macros;
  /** Las del día de descanso; null o ausente (snapshot de la versión 1): una sola meta. */
  readonly restDayTargets?: Macros | null;
  readonly hydrationTargetMl: number | null;
}

/**
 * La meta de alimentación de un día (RN-G03, 07 §2): un día de descanso lleva la de descanso del plan, si la tiene; uno de
 * entrenamiento o sin tipo (sin programa), la de la prescripción. El agua es la misma.
 */
export function dailyTargetOf(plan: PlanTargets, dayKind: DayKind | null = null): DailyTarget {
  const rest = dayKind === 'REST' ? (plan.restDayTargets ?? null) : null;
  const { kcal, choG, proteinG, fatG } = rest ?? plan.targets;
  return { kcal, choG, proteinG, fatG, waterMl: plan.hydrationTargetMl };
}

/**
 * La copia del plan vigente solo avanza (RN-E14): la reemplaza un plan publicado después, o el mismo si su evento se
 * entrega otra vez. Uno anterior que llega tarde (un reintento de la cola) no la pisa.
 */
export function replacesActivePlan(
  activePublishedAt: string | null,
  incomingPublishedAt: string,
): boolean {
  return (
    activePublishedAt === null || Date.parse(incomingPublishedAt) >= Date.parse(activePublishedAt)
  );
}

/** El día de un instante en la zona horaria del paciente (RN-G04), como YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
