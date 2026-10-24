'use client';

import type { FoodDetail, FoodListResponse } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';
import { FOOD_STATE_LABELS } from './labels';

/** Buscar un alimento del catálogo de referencia o de los propios (RN-I01) y traer sus medidas caseras. */
export function FoodSearch({
  label,
  full = false,
  onPick,
}: {
  label: string;
  /** Ya no caben más: los botones se desactivan. */
  full?: boolean;
  onPick: (food: FoodDetail) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [failed, setFailed] = useState<unknown>(null);
  const query = useDebounced(search.trim(), 250);
  const found = useQuery({
    queryKey: ['foods', query, 8],
    queryFn: () => apiFetch<FoodListResponse>(`/foods?q=${encodeURIComponent(query)}&limit=8`),
    enabled: query.length >= 2,
  });

  async function pick(foodId: string) {
    setFailed(null);
    try {
      onPick(
        await queryClient.query({
          queryKey: ['food', foodId],
          queryFn: () => apiFetch<FoodDetail>(`/foods/${foodId}`),
        }),
      );
    } catch (error) {
      setFailed(error);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md">
        <TextField
          label={label}
          type="search"
          autoComplete="off"
          hint="Escribe al menos 2 letras, sin importar las tildes."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <FormError error={found.error ?? failed} title="No pudimos traer el alimento" />
      {found.data && query.length >= 2 ? (
        found.data.foods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <ul
            aria-label="Alimentos encontrados"
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
          >
            {found.data.foods.map((food) => (
              <li
                key={food.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm">
                  {food.name}{' '}
                  <span className="text-muted-foreground">· {FOOD_STATE_LABELS[food.state]}</span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={full}
                  aria-label={`Agregar ${food.name}`}
                  onClick={() => {
                    void pick(food.id);
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
