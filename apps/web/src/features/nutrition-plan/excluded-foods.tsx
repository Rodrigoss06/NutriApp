'use client';

import type { FoodExclusionListResponse, FoodListResponse } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FOOD_STATE_LABELS } from '@/features/food/labels';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

type DietaryCondition = FoodExclusionListResponse['conditions'][number];

/**
 * Los alimentos que una alergia o intolerancia activa excluye de la dieta (RN-E17, ADR-074): un plan con alguno no se guarda
 * ni se publica, tampoco dentro de una receta. Lo enlaza quien atiende: el nombre de la condición no se compara con el
 * de los alimentos, así que sin enlaces no se bloquea nada.
 */
export function ExcludedFoods({
  patientId,
  condition,
  canWrite,
}: {
  patientId: string;
  condition: DietaryCondition;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 250);
  const { label, foods } = condition;
  const found = useQuery({
    queryKey: ['foods', query, 8],
    queryFn: () => apiFetch<FoodListResponse>(`/foods?q=${encodeURIComponent(query)}&limit=8`),
    enabled: adding && query.length >= 2,
  });
  const save = useMutation({
    mutationFn: (foodIds: readonly string[]) =>
      apiFetch(`/patients/${patientId}/food-exclusions/${condition.conditionId}`, {
        method: 'PUT',
        body: { foodIds },
      }),
    onSuccess: () => {
      setSearch('');
      router.refresh();
    },
  });
  const ids = foods.map((food) => food.id);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface p-3 text-sm">
      <p className="font-medium">Alimentos excluidos de su dieta</p>
      {foods.length === 0 ? (
        <p className="text-muted-foreground">
          Ningún alimento enlazado: por esta condición la dieta no bloquea nada.
        </p>
      ) : (
        <ul aria-label={`Alimentos excluidos por ${label}`} className="flex flex-col gap-1">
          {foods.map((food) => (
            <li key={food.id} className="flex flex-wrap items-center justify-between gap-2">
              {food.name}
              {canWrite ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={save.isPending}
                  aria-label={`Quitar ${food.name} de ${label}`}
                  onClick={() => {
                    save.mutate(ids.filter((id) => id !== food.id));
                  }}
                >
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <FormError error={save.error} title="No se guardó el alimento" />
      <FormError error={found.error} title="No pudimos buscar el alimento" />
      {canWrite && !adding ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Agregar alimento a ${label}`}
            onClick={() => {
              setAdding(true);
            }}
          >
            Agregar alimento
          </Button>
        </div>
      ) : null}
      {canWrite && adding ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <TextField
                label={`Buscar alimento para ${label}`}
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
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setSearch('');
              }}
            >
              Cerrar búsqueda
            </Button>
          </div>
          {found.data && query.length >= 2 ? (
            found.data.foods.length === 0 ? (
              <p className="text-muted-foreground">Sin resultados.</p>
            ) : (
              <ul
                aria-label={`Alimentos encontrados para ${label}`}
                className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
              >
                {found.data.foods.map((food) => {
                  const already = ids.includes(food.id);
                  return (
                    <li
                      key={food.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span>
                        {food.name}{' '}
                        <span className="text-muted-foreground">
                          · {FOOD_STATE_LABELS[food.state]}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={already || save.isPending}
                        aria-label={`Excluir ${food.name}`}
                        onClick={() => {
                          save.mutate([...ids, food.id]);
                        }}
                      >
                        {already ? 'Excluido' : 'Excluir'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
