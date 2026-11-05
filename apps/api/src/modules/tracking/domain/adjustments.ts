/**
 * Los ajustes del profesional sobre los registros del paciente (RN-G02, 05.2 tracking.log_adjustment): nunca sobrescriben. El
 * original queda como lo registró el paciente; el ajuste más reciente de cada registro dice si cuenta y con qué valores. Puro.
 */

export type AdjustmentTarget = 'FOOD' | 'HYDRATION' | 'WORKOUT' | 'SET' | 'CHECKIN' | 'METRIC';
export type AdjustmentAction = 'EXCLUDE' | 'CORRECT';
export type CorrectedValues = Readonly<Record<string, number | null>>;

/** Lo que pide el profesional; el contrato ya dejó solo los campos de cada tipo (ADR-085). */
export interface Correction {
  readonly grams?: number | undefined;
  readonly servings?: number | undefined;
  readonly volumeMl?: number | undefined;
  readonly value?: number | undefined;
  readonly reps?: number | undefined;
  readonly loadKg?: number | undefined;
  readonly durationMinutes?: number | undefined;
  readonly sessionRpe?: number | undefined;
}

export interface FoodAmounts {
  readonly servings: number | null;
  readonly grams: number | null;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
}

/**
 * La comida corregida (ADR-085): la cantidad nueva, en la unidad en que se registró (porciones si las tiene; si no, gramos), y
 * todo lo demás en proporción, también los nutrientes congelados. Un nutriente sin dato sigue sin dato (RN-I03). Si la corrección
 * viene en otra unidad o la cantidad registrada no sirve para escalar, null.
 */
export function foodCorrection(food: FoodAmounts, correction: Correction): CorrectedValues | null {
  const unit =
    food.servings !== null && food.servings > 0
      ? 'servings'
      : food.grams !== null && food.grams > 0
        ? 'grams'
        : null;
  if (unit === null) return null;
  const other = unit === 'servings' ? 'grams' : 'servings';
  const amount = correction[unit];
  const previous = food[unit];
  if (amount === undefined || correction[other] !== undefined || previous === null) return null;
  const factor = amount / previous;
  const scale = (value: number | null): number | null => (value === null ? null : value * factor);
  return {
    servings: unit === 'servings' ? amount : scale(food.servings),
    grams: unit === 'grams' ? amount : scale(food.grams),
    kcal: scale(food.kcal),
    choG: scale(food.choG),
    proteinG: scale(food.proteinG),
    fatG: scale(food.fatG),
  };
}

/** La serie corregida: repeticiones y peso, y su tonelaje sin el calentamiento (RN-F03). Sin ninguno de los dos, null. */
export function setCorrection(
  set: { readonly reps: number | null; readonly loadKg: number | null; readonly isWarmup: boolean },
  correction: Correction,
): CorrectedValues | null {
  if (correction.reps === undefined && correction.loadKg === undefined) return null;
  const reps = correction.reps ?? set.reps;
  const loadKg = correction.loadKg ?? set.loadKg;
  return { reps, loadKg, tonnageKg: set.isWarmup ? 0 : (reps ?? 0) * (loadKg ?? 0) };
}

/** La sesión corregida: duración y RPE. Sin ninguno de los dos, null. */
export function workoutCorrection(
  workout: { readonly durationMinutes: number | null; readonly sessionRpe: number | null },
  correction: Correction,
): CorrectedValues | null {
  if (correction.durationMinutes === undefined && correction.sessionRpe === undefined) return null;
  return {
    durationMinutes: correction.durationMinutes ?? workout.durationMinutes,
    sessionRpe: correction.sessionRpe ?? workout.sessionRpe,
  };
}

export interface AdjustmentLike {
  readonly targetId: string;
  readonly action: AdjustmentAction;
  readonly correctedValues: CorrectedValues | null;
  readonly createdAt: Date;
}

/** El ajuste que vale de cada registro: el más reciente. Los anteriores quedan como historial (RN-G02). */
export function latestByTarget<T extends AdjustmentLike>(
  adjustments: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const adjustment of adjustments) {
    const current = latest.get(adjustment.targetId);
    if (!current || adjustment.createdAt.getTime() >= current.createdAt.getTime()) {
      latest.set(adjustment.targetId, adjustment);
    }
  }
  return latest;
}

const numberOr = (values: CorrectedValues, key: string, fallback: number | null): number | null =>
  key in values ? (values[key] ?? null) : fallback;

/** Las comidas del día como cuentan para la analítica (RN-G02): sin las excluidas y con los valores corregidos. */
export function adjustedFoods<T extends FoodAmounts & { readonly id: string }>(
  foods: readonly T[],
  latest: ReadonlyMap<string, AdjustmentLike>,
): T[] {
  return foods.flatMap((food) => {
    const adjustment = latest.get(food.id);
    if (!adjustment) return [food];
    if (adjustment.action === 'EXCLUDE') return [];
    const values = adjustment.correctedValues ?? {};
    return [
      {
        ...food,
        servings: numberOr(values, 'servings', food.servings),
        grams: numberOr(values, 'grams', food.grams),
        kcal: numberOr(values, 'kcal', food.kcal),
        choG: numberOr(values, 'choG', food.choG),
        proteinG: numberOr(values, 'proteinG', food.proteinG),
        fatG: numberOr(values, 'fatG', food.fatG),
      },
    ];
  });
}

/** El agua del día con los ajustes: lo excluido no suma y lo corregido suma sus ml nuevos (RN-G02). */
export function adjustedWaterMl(
  hydration: readonly { readonly id: string; readonly volumeMl: number }[],
  latest: ReadonlyMap<string, AdjustmentLike>,
): number {
  return hydration.reduce((total, log) => {
    const adjustment = latest.get(log.id);
    if (!adjustment) return total + log.volumeMl;
    if (adjustment.action === 'EXCLUDE') return total;
    return total + (numberOr(adjustment.correctedValues ?? {}, 'volumeMl', log.volumeMl) ?? 0);
  }, 0);
}
