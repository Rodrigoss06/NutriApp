import { MACROS_DAY_PROFILE, runMethod } from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { dayProfileProblems, type DayProfileDraft } from '../domain/day-profiles.js';
import { invalidPlan } from '../domain/nutrition-plan.js';
import type { PlanMethodRun, PlanTargets } from './plan-calculation.js';

/** Un perfil de día con sus metas y su método (RN-D01, RN-D02): lo que muestran el editor, la app y el snapshot. */
export interface DayProfileTargets extends PlanTargets {
  readonly code: string;
  readonly name: string;
  readonly method: PlanMethodRun;
}

const lowerFirst = (text: string): string => text.charAt(0).toLocaleLowerCase('es') + text.slice(1);

/**
 * Las metas de cada perfil de día del plan (07 §2, P-20): los gramos que escribe el coach y las kcal que salen de ellos con
 * MACROS_DAY_PROFILE, porque mandan los gramos (P-20.2). Entrenamiento es la meta de la prescripción y no va aquí. Lo que no
 * cuadra es un 422 con cada problema, como el resto del plan.
 */
export function dayProfileTargetsOf(
  profiles: readonly DayProfileDraft[],
): Result<readonly DayProfileTargets[], DomainError> {
  const problems = dayProfileProblems(profiles);
  if (problems.length > 0) return err(invalidPlan(problems));
  const targets: DayProfileTargets[] = [];
  for (const profile of profiles) {
    const name = profile.name.trim();
    const run = runMethod(MACROS_DAY_PROFILE, {
      choG: profile.choG,
      proteinG: profile.proteinG,
      fatG: profile.fatG,
    });
    if (!run.ok) {
      const reason = run.errors.map((e) => lowerFirst(e.message)).join(' ');
      return err(invalidPlan([`El perfil «${name}»: ${reason}`]));
    }
    const { outputs, methodCode, methodVersion, inputsHash, warnings } = run.result;
    targets.push({
      code: profile.code,
      name,
      kcal: outputs.kcal,
      choG: outputs.choG,
      proteinG: outputs.proteinG,
      fatG: outputs.fatG,
      method: { methodCode, methodVersion, inputsHash, warnings },
    });
  }
  return ok(targets);
}
