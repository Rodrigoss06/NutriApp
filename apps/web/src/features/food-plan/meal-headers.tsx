'use client';

import { Button, formatNumber, Input, StatusBadge } from '@nutricoach/ui';
import { Plus, Trash2 } from 'lucide-react';
import { CellInput } from '@/features/nutrition-plan/cell-input';
import { isTimeOfDay, sharePctOf } from '@/features/nutrition-plan/draft';
import { TableScroll } from '@/features/shell/table-scroll';
import { MAX_MEALS, type MealHeaderRow } from './draft';

export const mealLabel = (meal: Pick<MealHeaderRow, 'name'>, index: number): string =>
  meal.name.trim() || `Tiempo ${String(index + 1)}`;

/**
 * Los tiempos de comida con su hora y su % de la meta del día, que suman 100 (RN-E09). En el menú valen para los siete
 * días.
 */
export function MealHeadersTable({
  meals,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  meals: readonly MealHeaderRow[];
  disabled: boolean;
  onChange: (
    key: string,
    change: Partial<Pick<MealHeaderRow, 'name' | 'timeOfDay' | 'sharePct'>>,
  ) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const shares = meals.map((m) => sharePctOf(m.sharePct));
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
            {meals.map((meal, index) => {
              const name = mealLabel(meal, index);
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
                        onChange(meal.key, { name: event.target.value });
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
                        onChange(meal.key, { timeOfDay: event.target.value });
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
                        onChange(meal.key, { sharePct: event.target.value });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar ${name}`}
                      disabled={disabled || meals.length === 1}
                      onClick={() => {
                        onRemove(meal.key);
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
          disabled={disabled || meals.length >= MAX_MEALS}
          onClick={onAdd}
        >
          <Plus aria-hidden className="size-4" />
          Agregar tiempo de comida
        </Button>
      </div>
    </div>
  );
}
