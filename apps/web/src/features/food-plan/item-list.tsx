'use client';

import { Button, Select } from '@nutricoach/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatMeasureGrams } from '@/features/food/format';
import { FoodSearch } from '@/features/food/food-search';
import { FOOD_STATE_LABELS } from '@/features/food/labels';
import { TextField } from '@/features/forms/fields';
import { GRAMS } from '@/features/recipe/draft';
import { RecipeSearch } from '@/features/recipe/recipe-search';
import {
  foodItemOf,
  itemError,
  pickedFoodRow,
  pickedRecipeRow,
  withItemChange,
  type ItemRow,
} from './draft';

type Update<R extends ItemRow> = (update: (items: readonly R[]) => readonly R[]) => void;

/**
 * Los alimentos (en gramos o medidas caseras, RN-E12) y las recetas (en porciones) de un tiempo o una opción del menú.
 * context nombra dónde están («Almuerzo del lunes, opción A») para que cada campo tenga un nombre único.
 */
export function ItemList<R extends ItemRow>({
  items,
  context,
  disabled,
  onChange,
}: {
  items: readonly R[];
  context: string;
  disabled: boolean;
  onChange: Update<R>;
}) {
  if (items.length === 0) return null;
  const where = <span className="sr-only"> · {context}</span>;
  return (
    <ul aria-label={context} className="flex flex-col">
      {items.map((row) => {
        const name = row.kind === 'FOOD' ? row.foodName : row.recipeName;
        const amount = row.kind === 'FOOD' ? foodItemOf(row) : null;
        return (
          <li
            key={row.key}
            className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0"
          >
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {name}{' '}
                <span className="font-normal text-muted-foreground">
                  · {row.kind === 'FOOD' ? FOOD_STATE_LABELS[row.foodState] : 'Receta'}
                </span>
              </p>
              {row.kind === 'FOOD' && row.unit === GRAMS && row.savedHouseholdText ? (
                <p className="text-sm text-muted-foreground">{row.savedHouseholdText}</p>
              ) : null}
              {row.kind === 'FOOD' && row.unit !== GRAMS && amount ? (
                <p className="text-sm text-muted-foreground tabular-nums">
                  Equivale a {formatMeasureGrams(amount.grams)}
                </p>
              ) : null}
            </div>
            {/* El nombre arriba y los campos en una fila: cabe en una columna angosta y en el celular. */}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-start gap-3">
              {row.kind === 'FOOD' ? (
                <Select
                  label={
                    <>
                      Medida<span className="sr-only"> de {name}</span>
                      {where}
                    </>
                  }
                  value={row.unit}
                  disabled={disabled}
                  onValueChange={(unit) => {
                    onChange((current) =>
                      withItemChange(current, row.key, {
                        unit,
                        amount: unit === GRAMS ? '100' : '1',
                      }),
                    );
                  }}
                  options={[
                    { value: GRAMS, label: 'Gramos' },
                    ...row.measures.map((measure) => ({
                      value: measure.id,
                      label: `${measure.name} (${formatMeasureGrams(measure.grams)})`,
                    })),
                  ]}
                />
              ) : (
                <span aria-hidden />
              )}
              <TextField
                label={
                  <>
                    {row.kind === 'RECIPE'
                      ? 'Porciones'
                      : row.unit === GRAMS
                        ? 'Gramos'
                        : 'Cantidad'}
                    <span className="sr-only"> de {name}</span>
                    {where}
                  </>
                }
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                value={row.kind === 'FOOD' ? row.amount : row.servings}
                error={itemError(row)}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((current) =>
                    withItemChange(
                      current,
                      row.key,
                      row.kind === 'FOOD' ? { amount: value } : { servings: value },
                    ),
                  );
                }}
              />
              <Button
                variant="ghost"
                className="mt-6"
                aria-label={`Quitar ${name} de ${context}`}
                disabled={disabled}
                onClick={() => {
                  onChange((current) => current.filter((r) => r.key !== row.key));
                }}
              >
                <Trash2 aria-hidden />
                <span className="hidden sm:inline">Quitar</span>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Agregar alimentos y, en el menú, recetas: el buscador se abre a pedido para no llenar la pantalla de buscadores.
 */
export function AddItems({
  context,
  full,
  allowRecipes,
  disabled,
  onAdd,
}: {
  context: string;
  full: boolean;
  allowRecipes: boolean;
  disabled: boolean;
  onAdd: (row: ItemRow) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || full}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Plus aria-hidden className="size-4" />
          {/* El contexto lo dan los títulos de alrededor; completo, solo para el lector de pantalla. */}
          Agregar<span className="sr-only"> a {context}</span>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <FoodSearch
        label={`Buscar alimento para ${context}`}
        full={full}
        onPick={(food) => {
          onAdd(pickedFoodRow(food, crypto.randomUUID()));
        }}
      />
      {allowRecipes ? (
        <RecipeSearch
          label={`Buscar receta para ${context}`}
          full={full}
          onPick={(recipe) => {
            onAdd(pickedRecipeRow(recipe, crypto.randomUUID()));
          }}
        />
      ) : null}
      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
          }}
        >
          Listo
        </Button>
      </div>
    </div>
  );
}
