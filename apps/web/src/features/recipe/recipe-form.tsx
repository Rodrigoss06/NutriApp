'use client';

import type { RecipeDetail, RecipePreviewResponse, RecipeRequest } from '@nutricoach/contracts';
import { Button, EmptyState, Select } from '@nutricoach/ui';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { CookingPot, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMeasureGrams } from '@/features/food/format';
import { FoodSearch } from '@/features/food/food-search';
import { FOOD_STATE_LABELS } from '@/features/food/labels';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { Section } from '@/features/patients/section';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';
import {
  draftErrors,
  draftOf,
  GRAMS,
  MAX_INGREDIENTS,
  requestOf,
  type IngredientRow,
  type MeasureOption,
  type RecipeDraft,
} from './draft';
import { RecipeCalculationView } from './recipe-calculation';

/**
 * Receta de la organización (RF-21): nombre, porciones que rinde, peso cocido si se pesó, etiquetas, preparación e
 * ingredientes en gramos de parte comestible o en medidas caseras (RN-E12). Mientras se escribe, la API calcula los
 * nutrientes por porción con el motor sin guardar nada. Editar envía la versión leída en If-Match.
 */
export function RecipeForm({
  recipe,
  measures,
}: {
  /** Al editar: la receta como se leyó. */
  recipe?: RecipeDetail;
  /** Al editar: las medidas caseras de cada alimento de la receta. */
  measures?: Readonly<Record<string, readonly MeasureOption[]>>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [draft, setDraft] = useState<RecipeDraft>(() => draftOf(recipe, measures));
  const [submitted, setSubmitted] = useState(false);
  const errors = draftErrors(draft);
  const request = requestOf(draft);
  // El texto del pedido, no el objeto: se compara por valor y la espera no se reinicia en cada render.
  const debouncedKey = useDebounced(request === null ? null : JSON.stringify(request), 300);
  const preview = useQuery({
    queryKey: ['recipe-preview', debouncedKey],
    queryFn: () =>
      apiFetch<RecipePreviewResponse>('/recipes/preview', {
        method: 'POST',
        body: JSON.parse(debouncedKey ?? 'null') as unknown,
      }),
    enabled: debouncedKey !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (body: RecipeRequest) =>
      recipe
        ? apiFetch<RecipeDetail>(`/recipes/${recipe.id}`, {
            method: 'PUT',
            body,
            headers: { 'If-Match': `"${String(recipe.version)}"` },
          })
        : apiFetch<RecipeDetail>('/recipes', { method: 'POST', body }),
    onSuccess: ({ id }) => {
      router.push(`/panel/biblioteca/recetas/${id}`);
      router.refresh();
    },
  });

  const set = (change: Partial<RecipeDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
  };
  const updateRow = (key: string, change: Partial<IngredientRow>) => {
    setDraft((current) => ({
      ...current,
      // Cambiar la cantidad o la medida olvida la medida con que se guardó.
      ingredients: current.ingredients.map((row) =>
        row.key === key ? { ...row, savedHouseholdText: null, ...change } : row,
      ),
    }));
  };
  // Los campos de arriba se marcan al intentar guardar; las cantidades, mientras se escriben.
  const shown = (message: string | undefined) => (submitted ? message : undefined);
  const result = draft.ingredients.length > 0 && request !== null ? preview.data : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (request) save.mutate(request);
      }}
    >
      <FormError
        error={save.error}
        title={recipe ? 'No se pudo guardar la receta' : 'No se pudo crear la receta'}
      />
      <Section title="Receta">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nombre de la receta"
            autoComplete="off"
            value={draft.name}
            error={shown(errors.name)}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
          <TextField
            label="Porciones que rinde"
            inputMode="decimal"
            autoComplete="off"
            value={draft.servings}
            error={shown(errors.servings)}
            onChange={(event) => {
              set({ servings: event.target.value });
            }}
          />
          <TextField
            label="Peso cocido en gramos (opcional)"
            inputMode="decimal"
            autoComplete="off"
            hint="Pesa la preparación terminada: da el rendimiento y los nutrientes por 100 g cocidos."
            value={draft.cookedWeightG}
            error={shown(errors.cookedWeightG)}
            onChange={(event) => {
              set({ cookedWeightG: event.target.value });
            }}
          />
          <TextField
            label="Etiquetas (opcional)"
            autoComplete="off"
            hint="Separadas por comas, como «almuerzo, sin gluten»."
            value={draft.tags}
            onChange={(event) => {
              set({ tags: event.target.value });
            }}
          />
        </div>
        <TextAreaField
          label="Preparación (opcional)"
          rows={4}
          value={draft.instructions}
          onChange={(event) => {
            set({ instructions: event.target.value });
          }}
        />
      </Section>

      <Section
        title="Ingredientes"
        description="En gramos de parte comestible y en el estado del alimento: el arroz cocido va en gramos de arroz cocido (RN-E12)."
      >
        <FoodSearch
          label="Buscar ingrediente"
          full={draft.ingredients.length >= MAX_INGREDIENTS}
          onPick={(food) => {
            setDraft((current) => ({
              ...current,
              ingredients: [
                ...current.ingredients,
                {
                  key: crypto.randomUUID(),
                  foodId: food.id,
                  foodName: food.name,
                  foodState: food.state,
                  measures: food.measures.map(({ id, name, grams }) => ({ id, name, grams })),
                  unit: GRAMS,
                  amount: '100',
                  savedHouseholdText: null,
                },
              ],
            }));
          }}
        />
        {draft.ingredients.length === 0 ? (
          <EmptyState
            icon={CookingPot}
            title="La receta no tiene ingredientes"
            description={
              submitted && errors.list
                ? errors.list
                : 'Busca un alimento y agrégalo para ver lo que aporta cada porción.'
            }
          />
        ) : (
          <ul aria-label="Ingredientes de la receta" className="flex flex-col gap-3">
            {draft.ingredients.map((row, index) => {
              const grams = result?.ingredients[index]?.grams;
              const error = errors.ingredients?.[row.key];
              return (
                <li
                  key={row.key}
                  className="grid items-start gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_18rem_8rem_auto]"
                >
                  <div className="flex flex-col gap-1 sm:pt-7">
                    <p className="font-medium">
                      {row.foodName}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {FOOD_STATE_LABELS[row.foodState]}
                      </span>
                    </p>
                    {row.unit === GRAMS && row.savedHouseholdText ? (
                      <p className="text-sm text-muted-foreground">{row.savedHouseholdText}</p>
                    ) : null}
                    {grams !== undefined && row.unit !== GRAMS ? (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        Equivale a {formatMeasureGrams(grams)}
                      </p>
                    ) : null}
                  </div>
                  <Select
                    label={
                      <>
                        Medida<span className="sr-only"> de {row.foodName}</span>
                      </>
                    }
                    value={row.unit}
                    onValueChange={(unit) => {
                      updateRow(row.key, { unit, amount: unit === GRAMS ? '100' : '1' });
                    }}
                    options={[
                      { value: GRAMS, label: 'Gramos' },
                      ...row.measures.map((measure) => ({
                        value: measure.id,
                        label: `${measure.name} (${formatMeasureGrams(measure.grams)})`,
                      })),
                    ]}
                  />
                  <TextField
                    label={
                      <>
                        {row.unit === GRAMS ? 'Gramos' : 'Cantidad'}
                        <span className="sr-only"> de {row.foodName}</span>
                      </>
                    }
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.amount}
                    error={error}
                    onChange={(event) => {
                      updateRow(row.key, { amount: event.target.value });
                    }}
                  />
                  <Button
                    variant="ghost"
                    className="sm:mt-6"
                    aria-label={`Quitar ${row.foodName}`}
                    onClick={() => {
                      set({ ingredients: draft.ingredients.filter((r) => r.key !== row.key) });
                    }}
                  >
                    <Trash2 aria-hidden />
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {draft.ingredients.length > 0 ? (
        <Section
          title="Nutrientes por porción"
          description="Vista previa: se calcula mientras escribes y se guarda con la receta."
        >
          {request === null ? (
            <p className="text-muted-foreground">
              Completa las porciones y las cantidades para calcular.
            </p>
          ) : preview.isError ? (
            <FormError error={preview.error} title="No pudimos calcular la receta" />
          ) : !result ? (
            <p className="text-muted-foreground">Calculando…</p>
          ) : (
            <RecipeCalculationView calculation={result.calculation} />
          )}
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canWrite || save.isPending}>
          {recipe ? 'Guardar cambios' : 'Crear receta'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            router.back();
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
