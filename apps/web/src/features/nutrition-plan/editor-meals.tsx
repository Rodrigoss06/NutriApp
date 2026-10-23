'use client';

import type {
  ExchangeGroupCode,
  FoodDetail,
  NutritionPlan,
  NutritionPlanPreview,
} from '@nutricoach/contracts';
import { Button, formatNumber, Input, Notice, StatusBadge } from '@nutricoach/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { TableScroll } from '@/features/shell/table-scroll';
import { AllowedFoodSearch } from './allowed-food-search';
import { CellInput } from './cell-input';
import {
  gramsOf,
  hasFood,
  isTimeOfDay,
  MAX_MEALS,
  servingsOf,
  sharePctOf,
  withFood,
  withFoodChange,
  withManualSplit,
  withMeal,
  withMealChange,
  withoutMeal,
  withSplitValue,
  type FoodRow,
  type MealRow,
  type PlanDraft,
} from './draft';
import { SplitTable } from './plan-tables';
import { DEFINING_MACRO, suggestedGrams } from './portion';

type ListGroup = NutritionPlan['exchangeList']['groups'][number];
type Change = (update: (draft: PlanDraft) => PlanDraft) => void;

const mealName = (meal: MealRow, index: number) =>
  meal.name.trim() || `Tiempo ${String(index + 1)}`;

/** Los tiempos de comida con su hora y su % del día, que suman 100 (RN-E09). */
function MealsTable({
  draft,
  change,
  disabled,
}: {
  draft: PlanDraft;
  change: Change;
  disabled: boolean;
}) {
  const shares = draft.meals.map((m) => sharePctOf(m.sharePct));
  const sum = shares.every((s): s is number => s !== null)
    ? shares.reduce((total, s) => total + s, 0)
    : null;
  // Se cuentan en centésimas, como la API: 33.33 + 33.33 + 33.34 suman 100.
  const complete = sum !== null && Math.round(sum * 100) === 10_000;
  return (
    <div className="flex flex-col gap-3">
      <TableScroll label="Tiempos de comida">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Tiempos de comida</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Nombre
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Hora
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                % del día
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.meals.map((meal, index) => {
              const name = mealName(meal, index);
              return (
                <tr key={meal.key} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Nombre del tiempo ${String(index + 1)}`}
                      aria-invalid={meal.name.trim() === '' ? true : undefined}
                      autoComplete="off"
                      maxLength={60}
                      className="min-w-36"
                      disabled={disabled}
                      value={meal.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        change((d) => withMealChange(d, meal.key, { name: value }));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="time"
                      aria-label={`Hora de ${name}`}
                      aria-invalid={isTimeOfDay(meal.timeOfDay) ? undefined : true}
                      className="w-32"
                      disabled={disabled}
                      value={meal.timeOfDay}
                      onChange={(event) => {
                        const value = event.target.value;
                        change((d) => withMealChange(d, meal.key, { timeOfDay: value }));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CellInput
                      label={`% del día de ${name}`}
                      inputMode="decimal"
                      disabled={disabled}
                      value={meal.sharePct}
                      error={sharePctOf(meal.sharePct) === null ? 'De 0 a 100.' : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        change((d) => withMealChange(d, meal.key, { sharePct: value }));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar ${name}`}
                      disabled={disabled || draft.meals.length === 1}
                      onClick={() => {
                        change((d) => withoutMeal(d, meal.key));
                      }}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums">
            Suman {sum === null ? '—' : formatNumber(sum, 'percent')} %
          </span>
          <StatusBadge tone={complete ? 'success' : 'warning'}>
            {complete ? 'Completo' : 'Deben sumar 100 %'}
          </StatusBadge>
        </p>
        <Button
          variant="secondary"
          disabled={disabled || draft.meals.length >= MAX_MEALS}
          onClick={() => {
            change((d) => withMeal(d, crypto.randomUUID()));
          }}
        >
          <Plus aria-hidden className="size-4" />
          Agregar tiempo de comida
        </Button>
      </div>
    </div>
  );
}

/** Un alimento permitido con su porción: gramos de parte comestible y medida casera (RN-E12, RN-G05). */
function FoodLine({
  food,
  group,
  disabled,
  onChange,
}: {
  food: FoodRow;
  group: ListGroup | undefined;
  disabled: boolean;
  onChange: (change: Partial<Pick<FoodRow, 'grams' | 'householdText'>> | null) => void;
}) {
  const defining = DEFINING_MACRO[food.groupCode];
  const suggestion = group ? suggestedGrams(food.groupCode, group, food.nutrientsPer100g) : null;
  return (
    <li className="grid items-start gap-3 border-t border-border py-3 first:border-t-0 sm:grid-cols-[1fr_8rem_12rem_auto]">
      <div className="flex flex-col gap-1 sm:pt-7">
        <p className="font-medium">{food.foodName}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {suggestion === null
            ? `Sin dato de ${defining.label}: escribe la porción.`
            : `Un intercambio son ${formatNumber(suggestion, 'grams')} g: aportan ${formatNumber(group?.[defining.macro], 'grams')} g de ${defining.label}.`}
        </p>
      </div>
      <TextField
        label={
          <>
            Gramos<span className="sr-only"> de {food.foodName}</span>
          </>
        }
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={food.grams}
        error={gramsOf(food.grams) === null ? 'Más de 0 y hasta 9999.' : undefined}
        onChange={(event) => {
          onChange({ grams: event.target.value });
        }}
      />
      <TextField
        label={
          <>
            Medida casera<span className="sr-only"> de {food.foodName}</span>
          </>
        }
        autoComplete="off"
        maxLength={120}
        placeholder="½ taza"
        disabled={disabled}
        value={food.householdText}
        onChange={(event) => {
          onChange({ householdText: event.target.value });
        }}
      />
      <div className="sm:pt-7">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Quitar ${food.foodName}`}
          disabled={disabled}
          onClick={() => {
            onChange(null);
          }}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </li>
  );
}

/**
 * Paso 3 · reparto y alimentos (RN-E09, RN-G05): los tiempos de comida con su %, el reparto por mayor residuo con la
 * opción de repartir un grupo a mano y, en cada tiempo, los alimentos que el paciente puede elegir de cada grupo que
 * tiene intercambios ahí, con la porción que aporta un intercambio.
 */
export function MealsStep({
  draft,
  change,
  groups,
  calculation,
  disabled,
}: {
  draft: PlanDraft;
  change: Change;
  groups: readonly ListGroup[];
  calculation: Pick<
    NutritionPlanPreview,
    'targets' | 'totals' | 'adequacy' | 'exchanges' | 'methods' | 'meals' | 'manualSplit'
  >;
  disabled: boolean;
}) {
  const [searching, setSearching] = useState<{ meal: string; group: ExchangeGroupCode } | null>(
    null,
  );
  const servingsIn = (index: number, code: ExchangeGroupCode) =>
    calculation.meals[index]?.servings[code] ?? 0;
  const groupOf = (code: ExchangeGroupCode) => groups.find((g) => g.code === code);

  function pick(meal: MealRow, code: ExchangeGroupCode, food: FoodDetail) {
    const nutrientsPer100g = Object.fromEntries(
      food.nutrients.filter((n) => n.core).map((n) => [n.code, n.valuePer100g]),
    );
    const group = groupOf(code);
    const suggestion = group ? suggestedGrams(code, group, nutrientsPer100g) : null;
    const grams = suggestion === null ? 0 : Math.round(suggestion);
    change((d) =>
      withFood(d, meal.key, {
        groupCode: code,
        foodId: food.id,
        foodName: food.name,
        grams: grams >= 1 && grams <= 9_999 ? String(grams) : '',
        householdText: '',
        nutrientsPer100g,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="tiempos-titulo" className="flex flex-col gap-3">
        <h3 id="tiempos-titulo" className="text-base font-semibold">
          Tiempos de comida
        </h3>
        <MealsTable draft={draft} change={change} disabled={disabled} />
      </section>

      <section aria-labelledby="reparto-titulo" className="flex flex-col gap-3">
        <h3 id="reparto-titulo" className="text-base font-semibold">
          Reparto de los intercambios
        </h3>
        <p className="text-sm text-muted-foreground">
          Cada grupo se reparte con los % de los tiempos y el redondeo por mayor residuo, sin
          cambiar el total del día. Un grupo repartido a mano debe sumar su total (RN-E09).
        </p>
        <SplitTable
          groups={groups}
          meals={draft.meals.map((meal, index) => ({
            name: mealName(meal, index),
            sharePct: meal.sharePct,
            servings: calculation.meals[index]?.servings ?? {},
          }))}
          calculation={calculation}
          manualSplit={Object.keys(draft.split) as ExchangeGroupCode[]}
          renderHeader={(group) => (
            <span className="flex flex-col items-end gap-1">
              {group.name}
              <label className="inline-flex items-center gap-1 text-xs font-normal">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  aria-label={`Repartir ${group.name} a mano`}
                  disabled={disabled}
                  checked={draft.split[group.code] !== undefined}
                  onChange={(event) => {
                    const manual = event.target.checked;
                    change((d) =>
                      withManualSplit(
                        d,
                        group.code,
                        manual ? d.meals.map((_, i) => servingsIn(i, group.code)) : null,
                      ),
                    );
                  }}
                />
                <span aria-hidden>a mano</span>
              </label>
            </span>
          )}
          renderCell={(code, index) => {
            const manual = draft.split[code];
            const meal = draft.meals[index];
            if (!manual || !meal) return formatNumber(servingsIn(index, code), 'exchanges');
            const text = manual[index] ?? '';
            return (
              <CellInput
                label={`${groupOf(code)?.name ?? code} en ${mealName(meal, index)}`}
                inputMode="numeric"
                disabled={disabled}
                value={text}
                error={servingsOf(text) === null ? 'Entero de 0 a 99.' : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  change((d) => withSplitValue(d, code, index, value));
                }}
              />
            );
          }}
        />
      </section>

      <section aria-labelledby="alimentos-titulo" className="flex flex-col gap-4">
        <h3 id="alimentos-titulo" className="text-base font-semibold">
          Alimentos permitidos
        </h3>
        <p className="text-sm text-muted-foreground">
          En cada tiempo, al menos un alimento por grupo con intercambios: el paciente elige entre
          ellos al registrar (RN-G05). La porción sugerida aporta lo mismo que un intercambio en el
          macronutriente que define al grupo; los gramos son de parte comestible.
        </p>
        {draft.meals.map((meal, index) => {
          const name = mealName(meal, index);
          const titleId = `alimentos-${meal.key}`;
          const shown = groups.filter((g) => servingsIn(index, g.code) > 0);
          const orphans = meal.foods.filter((f) => servingsIn(index, f.groupCode) === 0);
          return (
            <section
              key={meal.key}
              aria-labelledby={titleId}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
            >
              <h4 id={titleId} className="font-semibold">
                {name}
              </h4>
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin intercambios en este tiempo.</p>
              ) : null}
              {shown.map((group) => {
                const servings = servingsIn(index, group.code);
                const foods = meal.foods.filter((f) => f.groupCode === group.code);
                const open = searching?.meal === meal.key && searching.group === group.code;
                return (
                  <div key={group.code} className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      {group.name} ·{' '}
                      <span className="tabular-nums">
                        {formatNumber(servings, 'exchanges')}{' '}
                        {servings === 1 ? 'intercambio' : 'intercambios'}
                      </span>
                    </p>
                    {foods.length > 0 ? (
                      <ul aria-label={`${group.name} en ${name}`}>
                        {foods.map((food) => (
                          <FoodLine
                            key={food.foodId}
                            food={food}
                            group={group}
                            disabled={disabled}
                            onChange={(c) => {
                              change((d) => withFoodChange(d, meal.key, food, c));
                            }}
                          />
                        ))}
                      </ul>
                    ) : null}
                    {open ? (
                      <AllowedFoodSearch
                        groupName={group.name}
                        added={(foodId) => hasFood(meal, group.code, foodId)}
                        onPick={(food) => {
                          pick(meal, group.code, food);
                        }}
                        onClose={() => {
                          setSearching(null);
                        }}
                      />
                    ) : (
                      <div>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={disabled}
                          onClick={() => {
                            setSearching({ meal: meal.key, group: group.code });
                          }}
                        >
                          <Plus aria-hidden className="size-4" />
                          Agregar {group.name.toLowerCase()}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {orphans.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Notice
                    tone="warning"
                    title="Estos grupos ya no tienen intercambios en este tiempo: quita sus alimentos"
                    rule="RN-G05"
                  />
                  <ul aria-label={`Sin intercambios en ${name}`}>
                    {orphans.map((food) => (
                      <FoodLine
                        key={`${food.groupCode}-${food.foodId}`}
                        food={food}
                        group={groupOf(food.groupCode)}
                        disabled={disabled}
                        onChange={(c) => {
                          change((d) => withFoodChange(d, meal.key, food, c));
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </section>
    </div>
  );
}
