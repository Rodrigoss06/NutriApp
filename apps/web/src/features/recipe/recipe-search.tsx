'use client';

import type { RecipeListResponse, RecipeSummary } from '@nutricoach/contracts';
import { Button, formatNumber } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatServings } from '@/features/food/format';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

const LIMIT = 8;

/** Buscar una receta activa del recetario de la organización (RF-21); sin término, las primeras. */
export function RecipeSearch({
  label,
  full = false,
  onPick,
}: {
  label: string;
  full?: boolean;
  onPick: (recipe: RecipeSummary) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 250);
  const found = useQuery({
    queryKey: ['recipes', query, 'ACTIVE', LIMIT],
    queryFn: () =>
      apiFetch<RecipeListResponse>(
        `/recipes?${new URLSearchParams({ ...(query ? { q: query } : {}), limit: String(LIMIT) }).toString()}`,
      ),
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md">
        <TextField
          label={label}
          type="search"
          autoComplete="off"
          hint="Las recetas activas del recetario."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <FormError error={found.error} title="No pudimos buscar las recetas" />
      {found.data ? (
        found.data.recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin recetas.</p>
        ) : (
          <ul
            aria-label="Recetas encontradas"
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
          >
            {found.data.recipes.map((recipe) => (
              <li
                key={recipe.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm">
                  {recipe.name}{' '}
                  <span className="text-muted-foreground tabular-nums">
                    · rinde {formatServings(recipe.servings)}
                    {recipe.energyKcalPerServing === null
                      ? ''
                      : ` · ${formatNumber(recipe.energyKcalPerServing, 'kcal')} kcal por porción`}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={full}
                  aria-label={`Agregar la receta ${recipe.name}`}
                  onClick={() => {
                    onPick(recipe);
                  }}
                >
                  Agregar
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
