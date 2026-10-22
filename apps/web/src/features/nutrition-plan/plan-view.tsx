import type { NutritionPlan } from '@nutricoach/contracts';
import { enterStyle, formatNumber } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { AdequacyTable, ExchangeTable, SplitTable } from './plan-tables';

const ML = new Intl.NumberFormat('es-PE');

function Block({
  id,
  title,
  order,
  children,
}: {
  id: string;
  title: string;
  /** Orden en la entrada escalonada. */
  order: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="nc-enter flex flex-col gap-3"
      style={enterStyle(order)}
    >
      <h3 id={id} className="text-base font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Un plan publicado o reemplazado, leído de su snapshot (RN-E15): metas y adecuación, intercambios, reparto por tiempos y
 * alimentos permitidos con su porción, hidratación e indicaciones. Cada cálculo con su método (RN-D02).
 */
export function PlanView({ plan }: { plan: NutritionPlan }) {
  const groups = plan.exchangeList.groups;
  const mealName = (meal: NutritionPlan['meals'][number]) =>
    meal.timeOfDay ? `${meal.name} · ${meal.timeOfDay}` : meal.name;
  return (
    <div className="flex flex-col gap-8">
      <Block id="plan-adecuacion" title="Metas y adecuación" order={0}>
        <AdequacyTable calculation={plan} />
      </Block>

      <Block id="plan-intercambios" title="Intercambios del día" order={1}>
        <p className="text-sm text-muted-foreground">
          {plan.exchangeList.name} · versión {plan.exchangeList.version}
          {plan.exchangeList.provisional ? ' (provisional)' : ''}
        </p>
        <ExchangeTable groups={groups} calculation={plan} />
      </Block>

      <Block id="plan-reparto" title="Reparto por tiempos de comida" order={2}>
        <SplitTable
          groups={groups}
          meals={plan.meals.map((meal) => ({
            name: mealName(meal),
            sharePct: String(meal.sharePct),
            servings: meal.servings,
          }))}
          calculation={plan}
          manualSplit={plan.manualSplit}
        />
      </Block>

      <Block id="plan-alimentos" title="Alimentos permitidos" order={3}>
        <div className="grid gap-4 lg:grid-cols-2">
          {plan.meals.map((meal) => (
            <section
              key={meal.id}
              aria-labelledby={`comida-${meal.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
            >
              <h4 id={`comida-${meal.id}`} className="font-semibold">
                {mealName(meal)}
              </h4>
              {groups
                .filter((group) => meal.servings[group.code] > 0)
                .map((group) => {
                  const servings = meal.servings[group.code];
                  return (
                    <div key={group.code} className="flex flex-col gap-1 text-sm">
                      <p className="font-medium">
                        {group.name} ·{' '}
                        <span className="tabular-nums">
                          {formatNumber(servings, 'exchanges')}{' '}
                          {servings === 1 ? 'intercambio' : 'intercambios'}
                        </span>
                      </p>
                      <ul className="flex flex-col gap-0.5 pl-4">
                        {meal.allowedFoods
                          .filter((food) => food.groupCode === group.code)
                          .map((food) => (
                            <li key={food.foodId} className="list-disc">
                              {food.foodName} ·{' '}
                              <span className="tabular-nums">
                                {formatNumber(food.grams, 'grams')} g
                              </span>
                              {food.householdText ? ` · ${food.householdText}` : ''}
                            </li>
                          ))}
                      </ul>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      </Block>

      <Block id="plan-hidratacion" title="Hidratación e indicaciones" order={4}>
        <p className="text-sm">
          Meta de hidratación:{' '}
          <strong className="tabular-nums">
            {plan.hydrationTargetMl === null ? '—' : `${ML.format(plan.hydrationTargetMl)} ml`}
          </strong>{' '}
          por día.
        </p>
        <p className="whitespace-pre-line text-sm">{plan.instructions ?? 'Sin indicaciones.'}</p>
      </Block>
    </div>
  );
}
