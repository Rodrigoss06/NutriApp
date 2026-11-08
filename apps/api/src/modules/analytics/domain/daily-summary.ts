/**
 * El resumen de un día del paciente (05.3 `analytics.patient_daily_summary`): lo que consumió y entrenó contra la meta de ese día
 * (RN-G03), con los ajustes del profesional ya aplicados por tracking (RN-G02). Un dato que falta no es cero (RN-I03): se suma lo
 * conocido y se cuenta en cuántos registros falta. Puro: la adecuación la calcula el motor y llega como regla.
 */

/** Lo que llega de tracking, en tipos estructurales (02 §4: el dominio no importa otros módulos). */
export interface SummaryFood {
  readonly mealSlotCode: string;
  readonly inPlan: boolean;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
}

export interface SummaryDay {
  readonly localDate: string;
  readonly target: {
    readonly kcal: number | null;
    readonly choG: number | null;
    readonly proteinG: number | null;
    readonly fatG: number | null;
    readonly waterMl: number | null;
    readonly plannedSessions: number | null;
    /** El tipo del día (07 §8). */
    readonly dayKind: 'TRAINING' | 'REST' | null;
    /** El perfil de día de la meta (07 §2, P-20). */
    readonly dayProfileCode: string | null;
    readonly dayProfileName: string | null;
  } | null;
  readonly foods: readonly SummaryFood[];
  readonly hydrationLogs: number;
  readonly waterMl: number;
  readonly bodyWeightKg: number | null;
  readonly checkin: {
    readonly stress: number | null;
    readonly sleepHours: number | null;
    readonly energy: number | null;
    readonly srpeLoad: number | null;
  } | null;
  readonly workouts: readonly {
    readonly outcome: 'COMPLETED' | 'PARTIAL' | 'SKIPPED';
    readonly sets: readonly {
      readonly isWarmup: boolean;
      readonly tonnageKg: number;
      readonly durationSeconds: number | null;
      readonly muscleContributions: readonly { readonly muscle: string; readonly weight: number }[];
    }[];
  }[];
}

/** El grupo «Cardiorrespiratorio»: sus series son cardio en minutos, no volumen por grupo muscular (ADR-071, RN-F10). */
export const CARDIO_MUSCLE = 'CARDIO';

export const SUMMARY_NUTRIENTS = ['kcal', 'choG', 'proteinG', 'fatG', 'fiberG'] as const;
export type SummaryNutrient = (typeof SUMMARY_NUTRIENTS)[number];

/** La suma de lo conocido y en cuántos registros falta; sin registros, known es null. */
export interface NutrientTotal {
  readonly known: number | null;
  readonly missing: number;
}

export interface Adequacy {
  readonly pct: number | null;
  /** null si no se puede saber: sin meta, sin registros o con un dato faltante que no lo decide (RN-E10). */
  readonly inRange: boolean | null;
}

/** La adecuación de lo consumido contra la meta del día (RN-E10), con el rango de la organización. */
export type AdequacyRule = (total: NutrientTotal, target: number | null) => Adequacy;

export interface MealSlotDay {
  readonly planned: boolean;
  readonly logged: number;
}

export interface DailySummary {
  readonly localDate: string;
  /** El tipo del día según el programa vigente (07 §8); sin programa o sin meta, null. */
  readonly dayKind: 'TRAINING' | 'REST' | null;
  /** El perfil de día de su meta (07 §2, P-20); sin perfiles en el plan o sin meta, null. */
  readonly dayProfileCode: string | null;
  readonly dayProfileName: string | null;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
  readonly targetKcal: number | null;
  readonly targetChoG: number | null;
  readonly targetProteinG: number | null;
  readonly targetFatG: number | null;
  readonly adequacyKcalPct: number | null;
  readonly adequacyChoPct: number | null;
  readonly adequacyProteinPct: number | null;
  readonly adequacyFatPct: number | null;
  readonly kcalInRange: boolean | null;
  readonly mealsLogged: number;
  readonly mealsPlanned: number | null;
  readonly offPlanItems: number;
  readonly waterMl: number | null;
  readonly waterTargetMl: number | null;
  readonly workoutsDone: number;
  readonly workoutsPlanned: number | null;
  readonly tonnageKg: number | null;
  readonly effectiveSets: number | null;
  readonly srpeLoad: number | null;
  readonly cardioMinutes: number | null;
  readonly stress: number | null;
  readonly sleepHours: number | null;
  readonly energy: number | null;
  readonly bodyWeightKg: number | null;
  readonly mealSlots: Readonly<Record<string, MealSlotDay>>;
  readonly nutrientsMissing: Readonly<Record<SummaryNutrient | 'items', number>>;
}

/** Suma lo conocido de un nutriente y cuenta en cuántos registros falta (RN-I03). */
export function nutrientTotal(foods: readonly SummaryFood[], key: SummaryNutrient): NutrientTotal {
  if (foods.length === 0) return { known: null, missing: 0 };
  let known = 0;
  let missing = 0;
  for (const food of foods) {
    const value = food[key];
    if (value === null) missing += 1;
    else known += value;
  }
  return { known, missing };
}

/** Por tiempo de comida: si el plan de ese día lo tenía y cuántos registros tuvo (RF-32). */
export function mealSlotsOf(
  foods: readonly SummaryFood[],
  plannedSlots: readonly string[] | null,
): Record<string, MealSlotDay> {
  const slots: Record<string, MealSlotDay> = {};
  for (const slot of plannedSlots ?? []) slots[slot] = { planned: true, logged: 0 };
  for (const food of foods) {
    const current = slots[food.mealSlotCode] ?? { planned: false, logged: 0 };
    slots[food.mealSlotCode] = { planned: current.planned, logged: current.logged + 1 };
  }
  return slots;
}

/**
 * El resumen del día. `plannedSlots` son los tiempos del plan vigente ese día (null sin plan). Un día sin registros de comida o de
 * agua no consume 0: queda sin dato. Un entreno omitido no cuenta como hecho ni suma series (RN-F09).
 */
export function dailySummary(
  day: SummaryDay,
  plannedSlots: readonly string[] | null,
  adequacy: AdequacyRule,
): DailySummary {
  const totals = Object.fromEntries(
    SUMMARY_NUTRIENTS.map((key) => [key, nutrientTotal(day.foods, key)]),
  ) as Record<SummaryNutrient, NutrientTotal>;
  const target = day.target;
  const kcal = adequacy(totals.kcal, target?.kcal ?? null);
  const slots = mealSlotsOf(day.foods, plannedSlots);
  const done = day.workouts.filter((workout) => workout.outcome !== 'SKIPPED');
  const sets = done.flatMap((workout) => workout.sets.filter((set) => !set.isWarmup));
  return {
    localDate: day.localDate,
    kcal: totals.kcal.known,
    choG: totals.choG.known,
    proteinG: totals.proteinG.known,
    fatG: totals.fatG.known,
    fiberG: totals.fiberG.known,
    dayKind: target?.dayKind ?? null,
    dayProfileCode: target?.dayProfileCode ?? null,
    dayProfileName: target?.dayProfileName ?? null,
    targetKcal: target?.kcal ?? null,
    targetChoG: target?.choG ?? null,
    targetProteinG: target?.proteinG ?? null,
    targetFatG: target?.fatG ?? null,
    adequacyKcalPct: kcal.pct,
    adequacyChoPct: adequacy(totals.choG, target?.choG ?? null).pct,
    adequacyProteinPct: adequacy(totals.proteinG, target?.proteinG ?? null).pct,
    adequacyFatPct: adequacy(totals.fatG, target?.fatG ?? null).pct,
    kcalInRange: kcal.inRange,
    mealsLogged: Object.values(slots).filter((slot) => slot.logged > 0).length,
    mealsPlanned: plannedSlots?.length ?? null,
    offPlanItems: day.foods.filter((food) => !food.inPlan).length,
    waterMl: day.hydrationLogs === 0 ? null : day.waterMl,
    waterTargetMl: target?.waterMl ?? null,
    workoutsDone: done.length,
    workoutsPlanned: target?.plannedSessions ?? null,
    tonnageKg: done.length === 0 ? null : sets.reduce((total, set) => total + set.tonnageKg, 0),
    effectiveSets: done.length === 0 ? null : sets.length,
    srpeLoad: day.checkin?.srpeLoad ?? null,
    cardioMinutes:
      done.length === 0
        ? null
        : sets
            .filter((set) => set.muscleContributions.some((c) => c.muscle === CARDIO_MUSCLE))
            .reduce((total, set) => total + (set.durationSeconds ?? 0) / 60, 0),
    stress: day.checkin?.stress ?? null,
    sleepHours: day.checkin?.sleepHours ?? null,
    energy: day.checkin?.energy ?? null,
    bodyWeightKg: day.bodyWeightKg,
    mealSlots: slots,
    nutrientsMissing: {
      items: day.foods.length,
      kcal: totals.kcal.missing,
      choG: totals.choG.missing,
      proteinG: totals.proteinG.missing,
      fatG: totals.fatG.missing,
      fiberG: totals.fiberG.missing,
    },
  };
}
