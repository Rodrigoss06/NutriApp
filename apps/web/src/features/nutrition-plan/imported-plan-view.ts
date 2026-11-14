import type { ImportedPlan } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/ui';
import { formatDate } from '@/lib/dates';

/**
 * Las metas de un plan del sistema anterior (RF-40, ADR-135), tal como venían: cada una puede faltar y entonces no se muestra. Los
 * gramos y los mililitros, enteros al presentar (RN-D09).
 */
export function importedTargets(plan: ImportedPlan): readonly { label: string; value: string }[] {
  const targets: { label: string; value: string }[] = [];
  if (plan.targetKcal !== null)
    targets.push({ label: 'Energía', value: `${formatNumber(plan.targetKcal, 'kcal')} kcal` });
  if (plan.targetProteinG !== null) {
    targets.push({ label: 'Proteína', value: `${formatNumber(plan.targetProteinG, 'grams')} g` });
  }
  if (plan.targetFatG !== null)
    targets.push({ label: 'Grasa', value: `${formatNumber(plan.targetFatG, 'grams')} g` });
  if (plan.targetChoG !== null) {
    targets.push({ label: 'Carbohidratos', value: `${formatNumber(plan.targetChoG, 'grams')} g` });
  }
  if (plan.hydrationTargetMl !== null) {
    targets.push({ label: 'Agua', value: `${formatNumber(plan.hydrationTargetMl, 'kcal')} ml` });
  }
  return targets;
}

/** Desde cuándo y hasta cuándo valió; sin fin, «desde». */
export function importedPeriod(plan: ImportedPlan): string {
  return plan.validTo === null
    ? `Desde el ${formatDate(plan.validFrom)}`
    : `Del ${formatDate(plan.validFrom)} al ${formatDate(plan.validTo)}`;
}
