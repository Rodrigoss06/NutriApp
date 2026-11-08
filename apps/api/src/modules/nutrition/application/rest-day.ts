import { MACROS_REST_DAY, runMethod } from '@nutricoach/engine';
import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import type { PlanMethodRun, PlanTargets } from './plan-calculation.js';

/** Las metas del día de descanso con su método (RN-D01, RN-D02): lo que muestran el editor, la app y el snapshot. */
export interface RestDayTargets extends PlanTargets {
  readonly method: PlanMethodRun;
}

/** Las kcal del día de descanso dejan los carbohidratos negativos (RN-E07). */
export const REST_DAY_CARBS_NEGATIVE = 'NC-NUT-018';

/**
 * Las metas del día de descanso (07 §2, P-20): la meta de la prescripción es la del día de entrenamiento; con las kcal de
 * descanso que escribe el profesional, la proteína y la grasa no cambian y los carbohidratos van por diferencia
 * (MACROS_REST_DAY). Sin kcal de descanso, el plan tiene una sola meta.
 */
export function restDayTargetsOf(
  trainingDay: PlanTargets,
  restDayKcal: number | null,
): Result<RestDayTargets | null, DomainError> {
  if (restDayKcal === null) return ok(null);
  const run = runMethod(MACROS_REST_DAY, {
    targetKcal: restDayKcal,
    proteinG: trainingDay.proteinG,
    fatG: trainingDay.fatG,
  });
  if (!run.ok) {
    const [first] = run.errors;
    return err(
      domainError({
        code: REST_DAY_CARBS_NEGATIVE,
        rule: 'RN-E07',
        message: first?.message ?? 'Las metas del día de descanso no se pueden calcular.',
      }),
    );
  }
  const { outputs, methodCode, methodVersion, inputsHash, warnings } = run.result;
  return ok({
    kcal: restDayKcal,
    choG: outputs.choG,
    proteinG: outputs.proteinG,
    fatG: outputs.fatG,
    method: { methodCode, methodVersion, inputsHash, warnings },
  });
}
