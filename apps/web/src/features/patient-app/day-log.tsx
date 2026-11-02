'use client';

import type { FoodLog, MeDay } from '@nutricoach/contracts';
import { formatNumber, MEAL_SLOTS } from '@nutricoach/contracts';
import { Button, StatusBadge } from '@nutricoach/ui';
import { FormError } from '@/features/forms/form-error';
import { servingsText, useVoid } from './records';

const SLOT_ORDER = new Map<string, number>(MEAL_SLOTS.map((slot, index) => [slot, index]));

const portionOf = (log: FoodLog): string => {
  if (log.servings !== null && log.itemType !== 'FOOD') return servingsText(log.servings);
  return log.grams === null ? '' : `${formatNumber(log.grams, 'grams')} g`;
};

/**
 * Lo registrado en el día, con «Anular» mientras el día esté abierto (RN-G10, RN-G12): anular no borra, el registro queda
 * anulado y sale del total.
 */
export function DayLog({ day }: { day: MeDay }) {
  const voidFood = useVoid('/me/food-logs');
  const voidWater = useVoid('/me/hydration-logs');
  const foods = day.foods.toSorted(
    (a, b) => (SLOT_ORDER.get(a.mealSlotCode) ?? 99) - (SLOT_ORDER.get(b.mealSlotCode) ?? 99),
  );
  if (foods.length === 0 && day.hydration.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no registraste nada hoy.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <FormError error={voidFood.error ?? voidWater.error} title="No se anuló" />
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {foods.map((log) => (
          <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col">
              <span className="font-medium">{log.itemName}</span>
              <span className="text-sm text-muted-foreground">
                {portionOf(log)} ·{' '}
                {log.kcal === null ? 'sin dato de kcal' : `${formatNumber(log.kcal, 'kcal')} kcal`}
              </span>
              {log.inPlan ? null : (
                <StatusBadge tone="info" className="mt-1 w-fit">
                  Fuera del plan
                </StatusBadge>
              )}
            </div>
            {day.editable ? (
              <Button
                variant="ghost"
                size="touch"
                disabled={voidFood.isPending}
                aria-label={`Anular ${log.itemName}`}
                onClick={() => {
                  voidFood.mutate(log.id);
                }}
              >
                Anular
              </Button>
            ) : null}
          </li>
        ))}
        {day.hydration.map((log) => (
          <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">Agua · {formatNumber(log.volumeMl, 'grams')} ml</span>
            {day.editable ? (
              <Button
                variant="ghost"
                size="touch"
                disabled={voidWater.isPending}
                aria-label={`Anular ${formatNumber(log.volumeMl, 'grams')} ml de agua`}
                onClick={() => {
                  voidWater.mutate(log.id);
                }}
              >
                Anular
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
