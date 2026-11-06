import {
  adjustedFoods,
  adjustedWaterMl,
  latestByTarget,
  type AdjustmentLike,
  type CorrectedValues,
} from './adjustments.js';

/**
 * Los hechos de cada día del paciente como cuentan para la analítica (RN-G02, RN-G09): sus registros vigentes con el ajuste más
 * reciente del profesional aplicado (lo excluido no cuenta y lo corregido vale con sus valores nuevos) y la meta del día
 * (RN-G03). Un dato que falta no es cero (RN-I03). Puro.
 */

export interface FactTarget {
  readonly localDate: string;
  readonly nutritionPlanId: string | null;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly waterMl: number | null;
  readonly plannedSessions: number | null;
  readonly plannedSets: Readonly<Record<string, number>>;
}

export interface FactFood {
  readonly id: string;
  readonly localDate: string;
  readonly mealSlotCode: string;
  readonly inPlan: boolean;
  readonly servings: number | null;
  readonly grams: number | null;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  /** La fibra congelada (FIBTG), si el alimento la trae. */
  readonly fiberG: number | null;
}

export interface FactHydration {
  readonly id: string;
  readonly localDate: string;
  readonly volumeMl: number;
}

export interface FactMetric {
  readonly id: string;
  readonly localDate: string;
  readonly metricCode: string;
  readonly value: number;
  readonly measuredAt: Date;
}

/** El registro diario (RN-G11) con el rendimiento que calculó su recuperación (READINESS_JV). */
export interface FactCheckin {
  readonly id: string;
  readonly localDate: string;
  readonly sessionMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly sleepHours: number | null;
  readonly fatigue: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  readonly motivation: number | null;
  readonly energy: number | null;
  readonly menstrualSymptoms: number | null;
  readonly nutritionCompliancePct: number | null;
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
  readonly performancePct: number | null;
  /** La carga sRPE que calculó la recuperación: minutos × RPE (RN-G14). */
  readonly srpeLoad: number | null;
}

export interface FactWorkout {
  readonly id: string;
  readonly localDate: string;
  readonly outcome: 'COMPLETED' | 'PARTIAL' | 'SKIPPED';
  readonly programId: string | null;
  readonly mesocycleId: string | null;
  readonly weekNo: number | null;
  readonly isDeload: boolean;
  readonly durationMinutes: number | null;
  readonly sessionRpe: number | null;
}

export interface FactSet {
  readonly id: string;
  readonly localDate: string;
  readonly workoutLogId: string;
  readonly exerciseId: string;
  /** Congeladas al registrar: músculo principal 1 y secundario 0.5 (RN-F06). */
  readonly muscleContributions: readonly { readonly muscle: string; readonly weight: number }[];
  readonly isWarmup: boolean;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  readonly rpe: number | null;
  readonly stimulusRating: number | null;
  readonly fatigueRating: number | null;
  /** El cardio va en segundos (RN-F10). */
  readonly durationSeconds: number | null;
  /** Sin el calentamiento (RN-F03). */
  readonly tonnageKg: number;
}

export interface FactAdjustment extends AdjustmentLike {
  readonly targetLocalDate: string;
}

/** Lo que tracking guarda de un rango de días, sin ajustes aplicados. */
export interface RawFacts {
  readonly targets: readonly FactTarget[];
  readonly foods: readonly FactFood[];
  readonly hydration: readonly FactHydration[];
  readonly metrics: readonly FactMetric[];
  readonly checkins: readonly FactCheckin[];
  readonly workouts: readonly FactWorkout[];
  readonly sets: readonly FactSet[];
  readonly adjustments: readonly FactAdjustment[];
}

export type DayFood = Omit<FactFood, 'id' | 'localDate' | 'servings' | 'grams'>;
export type DaySet = Omit<FactSet, 'localDate' | 'workoutLogId'>;
export type DayCheckin = Omit<FactCheckin, 'id' | 'localDate'>;
export interface DayWorkout extends Omit<FactWorkout, 'localDate'> {
  readonly sets: readonly DaySet[];
}

export interface DayFacts {
  readonly localDate: string;
  readonly target: Omit<FactTarget, 'localDate'> | null;
  readonly foods: readonly DayFood[];
  /** Cuántos registros de agua cuentan: sin ninguno, el agua del día es «sin registro», no 0. */
  readonly hydrationLogs: number;
  readonly waterMl: number;
  /** El último peso del día (BODY_WEIGHT), con su ajuste. */
  readonly bodyWeightKg: number | null;
  readonly checkin: DayCheckin | null;
  readonly workouts: readonly DayWorkout[];
}

const BODY_WEIGHT = 'BODY_WEIGHT';

const numberIn = (values: CorrectedValues, key: string, fallback: number | null): number | null =>
  key in values ? (values[key] ?? null) : fallback;

/** La proporción de una comida corregida: la cantidad nueva sobre la registrada, en la unidad en que se corrigió (ADR-085). */
function amountFactor(food: FactFood, values: CorrectedValues): number | null {
  for (const key of ['servings', 'grams'] as const) {
    const before = food[key];
    const after = values[key];
    if (typeof after === 'number' && before !== null && before > 0) return after / before;
  }
  return null;
}

/** Las comidas que cuentan, con la fibra en la misma proporción que la cantidad corregida. */
function dayFoods(
  foods: readonly FactFood[],
  latest: ReadonlyMap<string, FactAdjustment>,
): DayFood[] {
  return adjustedFoods(foods, latest).map((food) => {
    const values = latest.get(food.id)?.correctedValues;
    // adjustedFoods cambió la cantidad: la proporción se mide contra la registrada, que sigue en `foods`.
    const registered = foods.find((candidate) => candidate.id === food.id) ?? food;
    const factor = values ? amountFactor(registered, values) : 1;
    const fiberG = food.fiberG === null || factor === null ? null : food.fiberG * factor;
    return {
      mealSlotCode: food.mealSlotCode,
      inPlan: food.inPlan,
      kcal: food.kcal,
      choG: food.choG,
      proteinG: food.proteinG,
      fatG: food.fatG,
      fiberG,
    };
  });
}

function dayWeight(
  metrics: readonly FactMetric[],
  latest: ReadonlyMap<string, FactAdjustment>,
): number | null {
  let weight: { value: number; at: number } | null = null;
  for (const metric of metrics) {
    if (metric.metricCode !== BODY_WEIGHT) continue;
    const adjustment = latest.get(metric.id);
    if (adjustment?.action === 'EXCLUDE') continue;
    const value = adjustment
      ? numberIn(adjustment.correctedValues ?? {}, 'value', metric.value)
      : metric.value;
    if (value === null) continue;
    const at = metric.measuredAt.getTime();
    if (weight === null || at >= weight.at) weight = { value, at };
  }
  return weight?.value ?? null;
}

function dayWorkouts(
  workouts: readonly FactWorkout[],
  sets: readonly FactSet[],
  latest: ReadonlyMap<string, FactAdjustment>,
): DayWorkout[] {
  return workouts.flatMap((workout) => {
    const adjustment = latest.get(workout.id);
    if (adjustment?.action === 'EXCLUDE') return [];
    const values = adjustment?.correctedValues ?? {};
    return [
      {
        id: workout.id,
        outcome: workout.outcome,
        programId: workout.programId,
        mesocycleId: workout.mesocycleId,
        weekNo: workout.weekNo,
        isDeload: workout.isDeload,
        durationMinutes: numberIn(values, 'durationMinutes', workout.durationMinutes),
        sessionRpe: numberIn(values, 'sessionRpe', workout.sessionRpe),
        sets: sets
          .filter((set) => set.workoutLogId === workout.id)
          .flatMap((set) => {
            const setAdjustment = latest.get(set.id);
            if (setAdjustment?.action === 'EXCLUDE') return [];
            const corrected = setAdjustment?.correctedValues ?? {};
            return [
              {
                id: set.id,
                exerciseId: set.exerciseId,
                muscleContributions: set.muscleContributions,
                isWarmup: set.isWarmup,
                rir: set.rir,
                rpe: set.rpe,
                stimulusRating: set.stimulusRating,
                fatigueRating: set.fatigueRating,
                durationSeconds: set.durationSeconds,
                reps: numberIn(corrected, 'reps', set.reps),
                loadKg: numberIn(corrected, 'loadKg', set.loadKg),
                tonnageKg: numberIn(corrected, 'tonnageKg', set.tonnageKg) ?? 0,
              },
            ];
          }),
      },
    ];
  });
}

const byDate = <T extends { readonly localDate: string }>(rows: readonly T[], date: string) =>
  rows.filter((row) => row.localDate === date);

/** Los días del rango con meta o con algún registro, en orden, con los ajustes aplicados (RN-G02). */
export function dayFacts(raw: RawFacts): DayFacts[] {
  const dates = new Set<string>();
  for (const rows of [
    raw.targets,
    raw.foods,
    raw.hydration,
    raw.metrics,
    raw.checkins,
    raw.workouts,
  ] as const) {
    for (const row of rows) dates.add(row.localDate);
  }
  return [...dates].sort().map((date) => {
    const latest = latestByTarget(
      raw.adjustments.filter((adjustment) => adjustment.targetLocalDate === date),
    );
    const target = raw.targets.find((row) => row.localDate === date);
    const hydration = byDate(raw.hydration, date);
    const checkin = raw.checkins.find((row) => row.localDate === date);
    return {
      localDate: date,
      target: target ? targetFields(target) : null,
      foods: dayFoods(byDate(raw.foods, date), latest),
      hydrationLogs: hydration.filter((log) => latest.get(log.id)?.action !== 'EXCLUDE').length,
      waterMl: adjustedWaterMl(hydration, latest),
      bodyWeightKg: dayWeight(byDate(raw.metrics, date), latest),
      checkin:
        checkin && latest.get(checkin.id)?.action !== 'EXCLUDE' ? checkinFields(checkin) : null,
      workouts: dayWorkouts(byDate(raw.workouts, date), byDate(raw.sets, date), latest),
    };
  });
}

function targetFields(target: FactTarget): Omit<FactTarget, 'localDate'> {
  return {
    nutritionPlanId: target.nutritionPlanId,
    kcal: target.kcal,
    choG: target.choG,
    proteinG: target.proteinG,
    fatG: target.fatG,
    waterMl: target.waterMl,
    plannedSessions: target.plannedSessions,
    plannedSets: target.plannedSets,
  };
}

function checkinFields(checkin: FactCheckin): DayCheckin {
  return {
    sessionMinutes: checkin.sessionMinutes,
    sessionRpe: checkin.sessionRpe,
    sleepHours: checkin.sleepHours,
    fatigue: checkin.fatigue,
    soreness: checkin.soreness,
    stress: checkin.stress,
    motivation: checkin.motivation,
    energy: checkin.energy,
    menstrualSymptoms: checkin.menstrualSymptoms,
    nutritionCompliancePct: checkin.nutritionCompliancePct,
    restingHrBpm: checkin.restingHrBpm,
    hrvMs: checkin.hrvMs,
    performancePct: checkin.performancePct,
    srpeLoad: checkin.srpeLoad,
  };
}
