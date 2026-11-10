'use client';

import type { ExchangePlanPreview } from '@nutricoach/contracts';
import { Button, formatNumber, StatusBadge } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';
import { CellInput } from './cell-input';
import { servingsOf, withProfileStarch, withProfileStarchValue, type PlanDraft } from './draft';
import { AdequacyTable, PlanMethod } from './plan-tables';

type Change = (update: (draft: PlanDraft) => PlanDraft) => void;
type Calculation = Pick<ExchangePlanPreview, 'dayProfiles' | 'meals' | 'methods'>;

/**
 * Los almidones de cada perfil de día por tiempo de comida (07 §2, P-20.5): el perfil es el mismo plan con más o menos
 * almidones, y lo demás no cambia. La API sugiere el reparto con STARCH_BY_DAY_PROFILE (primero la media tarde y luego la cena);
 * el coach lo ajusta a mano o vuelve a la sugerencia. Cada perfil muestra su adecuación frente a sus metas (RN-E10).
 */
export function ProfileStarchCard({
  draft,
  change,
  calculation,
  starchName,
  disabled,
}: {
  draft: PlanDraft;
  change: Change;
  calculation: Calculation;
  /** El nombre del grupo en la lista del plan. */
  starchName: string;
  disabled: boolean;
}) {
  const profiles = calculation.dayProfiles.filter((profile) => profile.portions !== null);
  if (profiles.length === 0) return null;
  return (
    <section aria-labelledby="almidones-perfil-titulo" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="almidones-perfil-titulo" className="text-base font-semibold">
          {starchName} por perfil de día
        </h3>
        <p className="text-sm text-muted-foreground">
          Cada perfil es este mismo plan con más o menos {starchName.toLocaleLowerCase('es')}: lo
          demás no cambia. La sugerencia quita primero de la media tarde y luego de la cena; puedes
          ajustarla.
        </p>
      </div>
      {profiles.map((profile) => {
        const portions = profile.portions;
        if (!portions) return null;
        const manual = draft.starchByProfile[profile.code];
        const titleId = `almidones-${profile.code}`;
        const total = portions.starchByMeal.reduce((sum, n) => sum + n, 0);
        const planTotal = calculation.meals.reduce((sum, meal) => sum + meal.servings.STA, 0);
        return (
          <section
            key={profile.code}
            aria-labelledby={titleId}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id={titleId} className="flex flex-wrap items-center gap-2 font-semibold">
                {profile.name}
                <StatusBadge tone="info">{manual ? 'Ajustado a mano' : 'Sugerencia'}</StatusBadge>
              </h4>
              {manual ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    change((d) => withProfileStarch(d, profile.code, null));
                  }}
                >
                  Volver a la sugerencia<span className="sr-only"> en {profile.name}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    change((d) => withProfileStarch(d, profile.code, portions.starchByMeal));
                  }}
                >
                  Ajustar a mano<span className="sr-only"> {profile.name}</span>
                </Button>
              )}
            </div>
            <TableScroll label={`${starchName} por tiempo en ${profile.name}`}>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  {starchName} por tiempo en {profile.name}
                </caption>
                <thead className="bg-surface text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Tiempo
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Entrenamiento
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {profile.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.meals.map((meal, index) => {
                    const name = meal.name.trim() || `Tiempo ${String(index + 1)}`;
                    const text = manual?.[index];
                    return (
                      <tr key={meal.key} className="border-t border-border">
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {name}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(calculation.meals[index]?.servings.STA, 'exchanges')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {text === undefined ? (
                            formatNumber(portions.starchByMeal[index], 'exchanges')
                          ) : (
                            <CellInput
                              label={`${starchName} en ${name}, ${profile.name}`}
                              inputMode="numeric"
                              disabled={disabled}
                              value={text}
                              error={servingsOf(text) === null ? 'Entero de 0 a 99.' : undefined}
                              onChange={(event) => {
                                const value = event.target.value;
                                change((d) =>
                                  withProfileStarchValue(d, profile.code, index, value),
                                );
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border font-medium">
                    <th scope="row" className="px-3 py-2 text-left">
                      Total del día
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(planTotal, 'exchanges')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(total, 'exchanges')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </TableScroll>
            {manual ? null : (
              <PlanMethod methods={calculation.methods} code="STARCH_BY_DAY_PROFILE" />
            )}
            <AdequacyTable
              label={`Adecuación de ${profile.name}`}
              calculation={{
                targets: profile,
                totals: portions.totals,
                adequacy: portions.adequacy,
                methods: calculation.methods,
              }}
            />
          </section>
        );
      })}
    </section>
  );
}
