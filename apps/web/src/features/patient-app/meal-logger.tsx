'use client';

import type { FoodLogsResponse, LogFood, MePlan, PlanOption } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/contracts';
import { Button, cn, Notice } from '@nutricoach/ui';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { newClientId, servingsText, useRecord } from './records';

type Meal = NonNullable<MePlan['plan']>['meals'][number];

/** Lo elegido, a un toque de quedar registrado: un alimento de un grupo, un alimento o una opción del menú. */
type Choice =
  | {
      kind: 'EXCHANGE';
      groupCode: string;
      foodId: string;
      label: string;
      planned: number;
      grams: number;
    }
  | { kind: 'FOOD'; foodId: string; label: string; grams: number }
  | { kind: 'MENU'; option: 'A' | 'B'; label: string };

const choiceKey = (choice: Choice): string =>
  choice.kind === 'MENU'
    ? `menu-${choice.option}`
    : `${choice.kind}-${'groupCode' in choice ? choice.groupCode : ''}-${choice.foodId}`;

function optionLabel(option: PlanOption & { kind: 'MENU' }): string {
  return option.items.map((item) => item.name).join(', ');
}

/**
 * Registrar desde el plan en tres toques o menos (RN-G06, RF-28): el tiempo de comida, el alimento permitido (o la opción del
 * menú) y «Registrar» con la porción del plan. Antes de registrar se puede cambiar la porción.
 */
export function MealLogger({
  meals,
  localDate,
  editable,
}: {
  meals: Meal[];
  localDate: string;
  editable: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-2">
      {meals.map((meal) => (
        <MealRow
          key={meal.id}
          meal={meal}
          localDate={localDate}
          editable={editable}
          expanded={open === meal.id}
          onToggle={() => {
            setOpen((current) => (current === meal.id ? null : meal.id));
          }}
        />
      ))}
    </ul>
  );
}

function MealRow({
  meal,
  localDate,
  editable,
  expanded,
  onToggle,
}: {
  meal: Meal;
  localDate: string;
  editable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const regionId = useId();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const record = useRecord<LogFood, FoodLogsResponse>('/me/food-logs');

  const choose = (next: Choice) => {
    setDone(null);
    record.reset();
    setChoice(next);
    if (next.kind === 'EXCHANGE') setServings(next.planned);
    if (next.kind === 'FOOD') setGrams(next.grams);
  };

  const submit = () => {
    if (!choice) return;
    const source: LogFood['source'] =
      choice.kind === 'EXCHANGE'
        ? {
            kind: 'EXCHANGE',
            mealId: meal.id,
            groupCode: choice.groupCode,
            foodId: choice.foodId,
            servings: servings === choice.planned ? null : servings,
          }
        : choice.kind === 'FOOD'
          ? {
              kind: 'FOOD',
              mealId: meal.id,
              foodId: choice.foodId,
              grams: grams === choice.grams ? null : grams,
            }
          : { kind: 'MENU', mealId: meal.id, option: choice.option };
    record.mutate(
      { clientId: newClientId(), localDate, source },
      {
        onSuccess: () => {
          const portion =
            choice.kind === 'EXCHANGE'
              ? `, ${servingsText(servings)}`
              : choice.kind === 'FOOD'
                ? `, ${formatNumber(grams, 'grams')} g`
                : '';
          setDone(`${choice.label}${portion}`);
          setChoice(null);
        },
      },
    );
  };

  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
        className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex flex-col">
          <span className="font-medium">{meal.name}</span>
          {meal.timeOfDay ? (
            <span className="text-sm text-muted-foreground">{meal.timeOfDay}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-5 transition-transform', expanded ? 'rotate-180' : '')}
        />
      </button>
      <div id={regionId} hidden={!expanded} className="flex flex-col gap-3 px-4 pb-4">
        {done ? (
          <Notice tone="success" title="Registrado">
            {done}.
          </Notice>
        ) : null}
        {meal.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este tiempo no tiene nada para hoy.</p>
        ) : null}
        {meal.options.map((option) => (
          <OptionBlock
            key={
              option.kind === 'EXCHANGE'
                ? option.groupCode
                : option.kind === 'MENU'
                  ? option.option
                  : option.foodId
            }
            option={option}
            editable={editable}
            selected={choice ? choiceKey(choice) : null}
            onChoose={choose}
          />
        ))}
        {choice ? (
          <div className="flex flex-col gap-3 rounded-lg border border-brand-border bg-muted p-3">
            <p className="font-medium">{choice.label}</p>
            {choice.kind === 'EXCHANGE' ? (
              <Stepper
                label="Porciones"
                value={servings}
                step={0.5}
                min={0.5}
                max={20}
                format={servingsText}
                onChange={setServings}
              />
            ) : null}
            {choice.kind === 'FOOD' ? (
              <Stepper
                label="Gramos"
                value={grams}
                step={10}
                min={10}
                max={5_000}
                format={(value) => `${formatNumber(value, 'grams')} g`}
                onChange={setGrams}
              />
            ) : null}
            <FormError error={record.error} title="No se registró" />
            <Button size="touch" onClick={submit} disabled={record.isPending}>
              Registrar
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function OptionBlock({
  option,
  editable,
  selected,
  onChoose,
}: {
  option: PlanOption;
  editable: boolean;
  selected: string | null;
  onChoose: (choice: Choice) => void;
}) {
  const choiceButton = (choice: Choice, text: string, detail: string | null) => (
    <Button
      key={choiceKey(choice)}
      variant={selected === choiceKey(choice) ? 'primary' : 'secondary'}
      size="touch"
      className="h-auto justify-between py-2 text-left whitespace-normal"
      aria-pressed={selected === choiceKey(choice)}
      disabled={!editable}
      onClick={() => {
        onChoose(choice);
      }}
    >
      <span>{text}</span>
      {detail ? <span className="text-sm font-normal">{detail}</span> : null}
    </Button>
  );
  if (option.kind === 'EXCHANGE') {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-muted-foreground">
          {option.groupName} · {servingsText(option.servings)}
        </legend>
        {option.foods.map((food) =>
          choiceButton(
            {
              kind: 'EXCHANGE',
              groupCode: option.groupCode,
              foodId: food.foodId,
              label: food.foodName,
              planned: option.servings,
              grams: food.gramsPerServing,
            },
            food.foodName,
            food.householdText ?? `${formatNumber(food.gramsPerServing, 'grams')} g por porción`,
          ),
        )}
      </fieldset>
    );
  }
  if (option.kind === 'FOOD') {
    return choiceButton(
      { kind: 'FOOD', foodId: option.foodId, label: option.foodName, grams: option.grams },
      option.foodName,
      option.householdText ?? `${formatNumber(option.grams, 'grams')} g`,
    );
  }
  return choiceButton(
    {
      kind: 'MENU',
      option: option.option,
      label: `Opción ${option.option}: ${optionLabel(option)}`,
    },
    `Opción ${option.option}`,
    optionLabel(option),
  );
}

/** Un número con «menos» y «más» de 44 px, para el pulgar (06 §8). */
function Stepper({
  label,
  value,
  step,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex items-center justify-between gap-3">
      <span id={id} className="text-sm text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="size-touch"
          aria-label={`Menos ${label.toLowerCase()}`}
          disabled={value - step < min}
          onClick={() => {
            onChange(Math.max(min, value - step));
          }}
        >
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" className="min-w-24 text-center font-medium tabular-nums">
          {format(value)}
        </output>
        <Button
          variant="secondary"
          size="icon"
          className="size-touch"
          aria-label={`Más ${label.toLowerCase()}`}
          disabled={value + step > max}
          onClick={() => {
            onChange(Math.min(max, value + step));
          }}
        >
          <Plus aria-hidden />
        </Button>
      </div>
    </div>
  );
}
