/** La meta de un día (05.2, tracking.daily_target): la del plan vigente ese día (RN-G03), con el perfil de día que la dio. */
export interface DailyTarget {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly waterMl: number | null;
  /** El perfil de día (07 §2): TRAINING, REST o uno propio. Sin perfiles en el plan, null: una sola meta. */
  readonly profileCode: string | null;
  readonly profileName: string | null;
}

interface Macros {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

/** Lo que la meta toma del snapshot del plan publicado. */
export interface PlanTargets {
  /** Las de la prescripción: las de Entrenamiento (07 §2). */
  readonly targets: Macros;
  /** Los demás perfiles de día (P-20); ausente en los snapshots anteriores a la versión 3: una sola meta. */
  readonly dayProfiles?: readonly (Macros & { readonly code: string; readonly name: string })[];
  readonly hydrationTargetMl: number | null;
}

/** El código de Entrenamiento: la meta de la prescripción. */
export const TRAINING_PROFILE = { code: 'TRAINING', name: 'Entrenamiento' } as const;

/**
 * La meta de alimentación de un día (RN-G03, 07 §2): la del perfil que pide el día (P-20.4). Entrenamiento, un día sin
 * programa (null) o un perfil que el plan no tiene llevan la de la prescripción. Un plan sin perfiles tiene una sola meta y
 * ningún perfil. El agua es la misma todos los días.
 */
export function dailyTargetOf(plan: PlanTargets, profileCode: string | null = null): DailyTarget {
  const profiles = plan.dayProfiles ?? [];
  const waterMl = plan.hydrationTargetMl;
  if (profiles.length === 0) {
    const { kcal, choG, proteinG, fatG } = plan.targets;
    return { kcal, choG, proteinG, fatG, waterMl, profileCode: null, profileName: null };
  }
  const profile = profiles.find((p) => p.code === profileCode);
  if (profile) {
    const { kcal, choG, proteinG, fatG, code, name } = profile;
    return { kcal, choG, proteinG, fatG, waterMl, profileCode: code, profileName: name };
  }
  const { kcal, choG, proteinG, fatG } = plan.targets;
  return {
    kcal,
    choG,
    proteinG,
    fatG,
    waterMl,
    profileCode: TRAINING_PROFILE.code,
    profileName: TRAINING_PROFILE.name,
  };
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
