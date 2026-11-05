import {
  adjustRecordSchema,
  type AdjustRecord,
  type AdjustmentTarget,
  type Correction,
  type PatientDay,
  type RecordAdjustment,
} from '@nutricoach/contracts';

export type CorrectionField = keyof Correction;

/** Un campo que el profesional corrige, con su valor registrado (ADR-085). */
export interface CorrectableField {
  readonly key: CorrectionField;
  readonly label: string;
  readonly unit?: 'g' | 'ml' | 'kg' | 'min';
  readonly integer?: boolean;
  readonly current: number | null;
}

/** El ajuste que vale de cada registro: el más reciente (RN-G02). */
export function latestByTarget(
  adjustments: readonly RecordAdjustment[],
): ReadonlyMap<string, RecordAdjustment> {
  const latest = new Map<string, RecordAdjustment>();
  for (const adjustment of adjustments) {
    const current = latest.get(adjustment.targetId);
    if (!current || adjustment.createdAt >= current.createdAt) {
      latest.set(adjustment.targetId, adjustment);
    }
  }
  return latest;
}

type Food = PatientDay['foods'][number];
type Workout = PatientDay['workouts'][number];
type WorkoutSet = Workout['sets'][number];

/** De una comida se corrige la cantidad en la unidad en que se registró: porciones si las tiene; si no, gramos. */
export const foodFields = (food: Food): readonly CorrectableField[] =>
  food.servings !== null && food.servings > 0
    ? [{ key: 'servings', label: 'Porciones', current: food.servings }]
    : [{ key: 'grams', label: 'Gramos', unit: 'g', current: food.grams }];

export const hydrationFields = (volumeMl: number): readonly CorrectableField[] => [
  { key: 'volumeMl', label: 'Agua', unit: 'ml', integer: true, current: volumeMl },
];

export const metricFields = (value: number): readonly CorrectableField[] => [
  { key: 'value', label: 'Peso', unit: 'kg', current: value },
];

export const setFields = (set: WorkoutSet): readonly CorrectableField[] => [
  { key: 'reps', label: 'Repeticiones', integer: true, current: set.reps },
  { key: 'loadKg', label: 'Peso', unit: 'kg', current: set.loadKg },
];

export const workoutFields = (workout: Workout): readonly CorrectableField[] => [
  {
    key: 'durationMinutes',
    label: 'Duración',
    unit: 'min',
    integer: true,
    current: workout.durationMinutes,
  },
  { key: 'sessionRpe', label: 'RPE de la sesión', current: workout.sessionRpe },
];

/**
 * El ajuste listo para la API (RN-G02): excluir sin valores, o corregir solo lo que cambió. Valida con el mismo contrato; si
 * algo no pasa, devuelve qué decir.
 */
export function adjustmentBody(input: {
  readonly targetType: AdjustmentTarget;
  readonly targetId: string;
  readonly targetLocalDate: string;
  readonly action: 'EXCLUDE' | 'CORRECT';
  readonly fields: readonly CorrectableField[];
  readonly values: Readonly<Partial<Record<CorrectionField, number | null>>>;
  readonly reason: string;
}): { ok: true; body: AdjustRecord } | { ok: false; problem: string } {
  const changed: Partial<Record<CorrectionField, number>> = {};
  if (input.action === 'CORRECT') {
    for (const field of input.fields) {
      const value = input.values[field.key];
      if (value !== undefined && value !== null && value !== field.current)
        changed[field.key] = value;
    }
    if (Object.keys(changed).length === 0) {
      return { ok: false, problem: 'Cambia al menos un valor, o elige excluir el registro.' };
    }
  }
  const parsed = adjustRecordSchema.safeParse({
    targetType: input.targetType,
    targetId: input.targetId,
    targetLocalDate: input.targetLocalDate,
    action: input.action,
    correctedValues: input.action === 'CORRECT' ? changed : null,
    reason: input.reason,
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  const reason = parsed.error.issues.find((issue) => issue.path[0] === 'reason');
  return {
    ok: false,
    problem: reason
      ? 'Escribe el motivo, de 10 caracteres o más.'
      : 'Revisa los valores corregidos: alguno está fuera de rango o con demasiados decimales.',
  };
}

/** Un día del calendario sumando o restando días, sin zona horaria: es una fecha local (RN-G04). */
export function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}
