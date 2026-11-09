import type { ExchangeNutritionPlan } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';
import { AdequacyTable, PlanMethod } from './plan-tables';

/**
 * Los almidones de cada perfil por tiempo en un plan publicado (P-20.5): la columna de Entrenamiento es el plan y cada perfil
 * trae la suya, con su adecuación (RN-E10). Lo publicado antes de las porciones por perfil no las trae y no muestra nada.
 */
export function ProfileStarchTable({
  plan,
  starchName,
}: {
  plan: Pick<ExchangeNutritionPlan, 'meals' | 'dayProfiles' | 'methods'>;
  starchName: string;
}) {
  const profiles = plan.dayProfiles.flatMap((profile) =>
    profile.portions ? [{ ...profile, portions: profile.portions }] : [],
  );
  if (profiles.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <TableScroll label={`${starchName} por perfil de día`}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{starchName} de cada tiempo por perfil de día</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Tiempo
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Entrenamiento
              </th>
              {profiles.map((profile) => (
                <th key={profile.code} scope="col" className="px-3 py-2 text-right font-medium">
                  {profile.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.meals.map((meal, index) => (
              <tr key={meal.id} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {meal.name}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(meal.servings.STA, 'exchanges')}
                </td>
                {profiles.map((profile) => (
                  <td key={profile.code} className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(profile.portions.starchByMeal[index], 'exchanges')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {profiles.map((profile) => (
        <AdequacyTable
          key={profile.code}
          label={`Adecuación de ${profile.name}`}
          calculation={{
            targets: profile,
            totals: profile.portions.totals,
            adequacy: profile.portions.adequacy,
            methods: plan.methods,
          }}
        />
      ))}
      {profiles.some((profile) => !profile.portions.manual) ? (
        <PlanMethod methods={plan.methods} code="STARCH_BY_DAY_PROFILE" />
      ) : null}
    </div>
  );
}
