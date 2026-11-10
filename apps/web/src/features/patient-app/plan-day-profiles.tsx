import type { MePlan } from '@nutricoach/contracts';
import { formatNumber, StatusBadge } from '@nutricoach/ui';

type CurrentPlan = NonNullable<MePlan['plan']>;

/**
 * Las metas de cada tipo de día del plan (07 §2, P-20): Entrenamiento y los perfiles que fijó el profesional, con el de hoy
 * marcado. La app no calcula nada: muestra lo que trae el plan. Un plan con una sola meta no muestra nada.
 */
export function PlanDayProfiles({
  plan,
  todayCode,
}: {
  plan: CurrentPlan;
  /** El perfil con que se fijó la meta de hoy; null si el plan tiene una sola meta. */
  todayCode: string | null;
}) {
  if (plan.dayProfiles.length === 0) return null;
  const rows = [{ code: 'TRAINING', name: 'Entrenamiento', ...plan.targets }, ...plan.dayProfiles];
  return (
    <section aria-labelledby="metas-dia" className="flex flex-col gap-2">
      <h2 id="metas-dia" className="text-lg font-semibold">
        Tus metas por tipo de día
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.code}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3"
          >
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {row.name}
              {row.code === todayCode ? <StatusBadge tone="info">Hoy</StatusBadge> : null}
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {formatNumber(row.kcal, 'kcal')} kcal · carbohidratos{' '}
              {formatNumber(row.choG, 'grams')} g · proteína {formatNumber(row.proteinG, 'grams')} g
              · grasa {formatNumber(row.fatG, 'grams')} g
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
