'use client';

import type { FoodDetail, FoodListResponse } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FOOD_STATE_LABELS } from '@/features/food/labels';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

/**
 * Buscar un alimento permitido para un grupo de un tiempo (RN-G05): del catálogo de referencia o de los propios de la
 * organización (RN-I01). Al elegirlo trae su detalle, con los nutrientes para sugerir los gramos (ADR-057).
 */
export function AllowedFoodSearch({
  groupName,
  added,
  onPick,
  onClose,
}: {
  groupName: string;
  added: (foodId: string) => boolean;
  onPick: (food: FoodDetail) => void;
  onClose: () => void;
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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <TextField
            label={`Buscar alimento de ${groupName}`}
            type="search"
            autoComplete="off"
            // Se abre a pedido de la persona: el foco va al campo que acaba de pedir.
            autoFocus
            hint="Escribe al menos 2 letras, sin importar las tildes."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <Button variant="ghost" onClick={onClose}>
          Cerrar búsqueda
        </Button>
      </div>
      <FormError error={found.error ?? failed} title="No pudimos traer el alimento" />
      {found.data && query.length >= 2 ? (
        found.data.foods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <ul
            aria-label={`Alimentos encontrados para ${groupName}`}
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
          >
            {found.data.foods.map((food) => {
              const already = added(food.id);
              return (
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
                    disabled={already}
                    aria-label={`Agregar ${food.name}`}
                    onClick={() => {
                      void pick(food.id);
                    }}
                  >
                    {already ? 'Agregado' : 'Agregar'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
