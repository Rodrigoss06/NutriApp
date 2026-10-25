'use client';

import type {
  CompositionNutritionPlan,
  MenuItemView,
  WeeklyMenuNutritionPlan,
} from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/ui';
import { useState } from 'react';
import { formatServings } from '@/features/food/format';
import { Block } from '@/features/nutrition-plan/plan-view';
import { TableScroll } from '@/features/shell/table-scroll';
import { DayTabs, dayPanelId, dayTabId } from './day-tabs';
import { DAY_NAMES } from './draft';
import { FoodAdequacyTable, MacroSummary, NutrientTables, WeekTable } from './plan-totals';

const ML = new Intl.NumberFormat('es-PE');

/** Un alimento o una receta en una línea: «Arroz cocido · 150 g · 1 taza», «Arroz con pollo · 1 porción». */
function itemText(item: MenuItemView): string {
  if (item.itemType === 'RECIPE') return `${item.recipeName} · ${formatServings(item.servings)}`;
  const grams = `${formatNumber(item.grams, 'grams')} g`;
  return [item.foodName, grams, item.householdText].filter(Boolean).join(' · ');
}

function Items({ items, label }: { items: readonly MenuItemView[]; label: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-0.5 pl-4 text-sm">
      {items.map((item, i) => (
        <li key={`${item.itemType}-${String(i)}`} className="list-disc">
          {itemText(item)}
        </li>
      ))}
    </ul>
  );
}

function Hydration({
  plan,
}: {
  plan: Pick<CompositionNutritionPlan, 'hydrationTargetMl' | 'instructions'>;
}) {
  return (
    <>
      <p className="text-sm">
        Meta de hidratación:{' '}
        <strong className="tabular-nums">
          {plan.hydrationTargetMl === null ? '—' : `${ML.format(plan.hydrationTargetMl)} ml`}
        </strong>{' '}
        por día.
      </p>
      <p className="whitespace-pre-line text-sm">{plan.instructions ?? 'Sin indicaciones.'}</p>
    </>
  );
}

const mealName = (meal: { name: string; timeOfDay: string | null }) =>
  meal.timeOfDay ? `${meal.name} · ${meal.timeOfDay}` : meal.name;

/**
 * Una dieta por composición publicada o reemplazada, leída de su snapshot (RN-E15): metas y adecuación, cada tiempo con
 * sus alimentos y lo que aporta, y el día con todos sus nutrientes (RN-E16). Cada cálculo con su método (RN-D02).
 */
export function CompositionView({ plan }: { plan: CompositionNutritionPlan }) {
  return (
    <div className="flex flex-col gap-8">
      <Block id="plan-adecuacion" title="Metas y adecuación" order={0}>
        <FoodAdequacyTable
          targets={plan.targets}
          adequacy={plan.adequacy}
          planned={(code) => plan.totals.nutrients[code] ?? { value: 0, known: 0, missing: 0 }}
          plannedLabel="Plan"
          of={plan.totals.ingredientCount}
          methods={plan.methods}
        />
      </Block>

      <Block id="plan-tiempos" title="Alimentos por tiempo" order={1}>
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
              <Items items={meal.items} label={`Alimentos de ${meal.name}`} />
              <MacroSummary totals={meal.totals} label={`Lo que aporta ${meal.name}`} />
            </section>
          ))}
        </div>
      </Block>

      <Block id="plan-dia" title="Lo que aporta el día" order={2}>
        <NutrientTables
          totals={plan.totals}
          nutrients={plan.nutrients}
          valueLabel="Día"
          caption="Día"
        />
      </Block>

      <Block id="plan-hidratacion" title="Hidratación e indicaciones" order={3}>
        <Hydration plan={plan} />
      </Block>
    </div>
  );
}

/** La opción A de una celda y, si hay, la B. */
function Cell({
  cell,
  label,
}: {
  cell: WeeklyMenuNutritionPlan['days'][number]['meals'][number];
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Items items={cell.optionA} label={`${label}, opción A`} />
      {cell.optionB.length > 0 ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">Opción B</p>
          <Items items={cell.optionB} label={`${label}, opción B`} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Un menú semanal publicado o reemplazado, leído de su snapshot (RN-E15): la adecuación del promedio, la semana en una
 * grilla de días por tiempos (en el celular, por pestañas), el resumen de cada día y el promedio (RN-E16).
 */
export function MenuView({ plan }: { plan: WeeklyMenuNutritionPlan }) {
  const [day, setDay] = useState(0);
  const selected = plan.days[day];
  const dayName = DAY_NAMES[day] ?? '';
  return (
    <div className="flex flex-col gap-8">
      <Block id="plan-adecuacion" title="Metas y adecuación del promedio semanal" order={0}>
        <FoodAdequacyTable
          targets={plan.targets}
          adequacy={plan.adequacy}
          planned={(code) => {
            const average = plan.weeklyAverage[code];
            return average
              ? { value: average.value, known: average.known, missing: average.missingDays }
              : { value: 0, known: 0, missing: 0 };
          }}
          plannedLabel="Promedio"
          of={plan.days.length}
          methods={plan.methods}
        />
      </Block>

      <Block id="plan-semana" title="Menú de la semana" order={1}>
        <div className="hidden lg:block">
          <TableScroll label="Menú de la semana">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Menú de la semana: tiempos de comida por día</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Tiempo de comida</span>
                  </th>
                  {DAY_NAMES.map((name) => (
                    <th key={name} scope="col" className="px-3 py-2 font-medium">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.meals.map((meal, m) => (
                  <tr
                    key={`${meal.name}-${String(m)}`}
                    className="border-t border-border align-top"
                  >
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {mealName(meal)}
                    </th>
                    {plan.days.map((d, i) => {
                      const cell = d.meals[m];
                      return (
                        <td key={d.dayOfWeek} className="min-w-40 px-3 py-2">
                          {cell ? (
                            <Cell
                              cell={cell}
                              label={`${meal.name} del ${(DAY_NAMES[i] ?? '').toLowerCase()}`}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
        <div className="flex flex-col gap-4 lg:hidden">
          <DayTabs prefix="semana" label="Días del menú" selected={day} onSelect={setDay} />
          <div
            role="tabpanel"
            id={dayPanelId('semana', day)}
            aria-labelledby={dayTabId('semana', day)}
            className="flex flex-col gap-3"
          >
            {plan.meals.map((meal, m) => {
              const cell = selected?.meals[m];
              return (
                <section
                  key={`${meal.name}-${String(m)}`}
                  aria-label={`${meal.name} del ${dayName.toLowerCase()}`}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
                >
                  <h4 className="font-semibold">{mealName(meal)}</h4>
                  {cell ? (
                    <Cell cell={cell} label={`${meal.name} del ${dayName.toLowerCase()}`} />
                  ) : null}
                </section>
              );
            })}
            {selected ? (
              <MacroSummary totals={selected.totals} label={`Lo que aporta el ${dayName}`} />
            ) : null}
          </div>
        </div>
      </Block>

      <Block id="plan-resumen" title="Resumen de la semana" order={2}>
        <WeekTable days={plan.days.map((d) => d.totals)} weeklyAverage={plan.weeklyAverage} />
      </Block>

      <Block id="plan-hidratacion" title="Hidratación e indicaciones" order={3}>
        <Hydration plan={plan} />
      </Block>
    </div>
  );
}
