/** La meta de un día (05.2, tracking.daily_target): la del plan vigente ese día (RN-G03). */
export interface DailyTarget {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly waterMl: number | null;
}

/** Lo que la meta toma del snapshot del plan publicado. */
export interface PlanTargets {
  readonly targets: {
    readonly kcal: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
  };
  readonly hydrationTargetMl: number | null;
}

export function dailyTargetOf(plan: PlanTargets): DailyTarget {
  return { ...plan.targets, waterMl: plan.hydrationTargetMl };
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
