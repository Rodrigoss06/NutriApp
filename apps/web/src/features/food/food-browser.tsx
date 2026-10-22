'use client';

import type { FoodListResponse } from '@nutricoach/contracts';
import { buttonVariants, EmptyState, StatusBadge } from '@nutricoach/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { TableScroll } from '@/features/shell/table-scroll';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';
import { formatPer100g } from './format';
import { FOOD_STATE_LABELS, sourceLabel } from './labels';

const LIMIT = 50;

/**
 * Alimentos de referencia y propios de la organización (RF-38, RN-I01): la búsqueda va mientras se escribe, sin
 * importar las tildes, y queda en la dirección para volver a ella desde el detalle.
 */
export function FoodBrowser() {
  const canWrite = useCanWrite();
  // De la dirección y no de la página del servidor: al volver atrás, la página puede venir de la caché del router.
  const searchParams = useSearchParams();
  const [text, setText] = useState(() => searchParams.get('q') ?? '');
  const query = useDebounced(text.trim(), 250);
  // La búsqueda queda en la dirección sin volver a pedir la página al servidor.
  useEffect(() => {
    const url = query ? `?q=${encodeURIComponent(query)}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [query]);
  const found = useQuery({
    queryKey: ['foods', query],
    queryFn: () =>
      apiFetch<FoodListResponse>(
        `/foods?${new URLSearchParams({ ...(query ? { q: query } : {}), limit: String(LIMIT) }).toString()}`,
      ),
    placeholderData: keepPreviousData,
  });
  const foods = found.data?.foods ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1" role="search" aria-label="Catálogo de alimentos">
          <TextField
            label="Buscar alimento"
            type="search"
            autoComplete="off"
            hint="Sin importar las tildes: «platano» encuentra «Plátano»."
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </div>
        {canWrite ? (
          <Link href="/panel/biblioteca/alimentos/nuevo" className={buttonVariants()}>
            <Plus aria-hidden />
            Nuevo alimento propio
          </Link>
        ) : null}
      </div>
      {found.isError ? (
        <FormError error={found.error} title="No pudimos buscar alimentos" />
      ) : !found.data ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : foods.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={`No encontramos alimentos con «${query}». Prueba con menos palabras o crea uno propio.`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {foods.length === LIMIT
              ? `Los ${String(LIMIT)} primeros: escribe más palabras para afinar.`
              : `${String(foods.length)} ${foods.length === 1 ? 'alimento' : 'alimentos'}.`}
          </p>
          <TableScroll label="Alimentos encontrados">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Alimentos encontrados</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Alimento
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Grupo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Energía por 100 g
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Fuente
                  </th>
                </tr>
              </thead>
              <tbody>
                {foods.map((food) => (
                  <tr key={food.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={`/panel/biblioteca/alimentos/${food.id}`}
                        className="font-medium text-brand-text underline"
                      >
                        {food.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{food.groupName ?? '—'}</td>
                    <td className="px-3 py-2">{FOOD_STATE_LABELS[food.state]}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {formatPer100g(food.energyKcalPer100g, 'ENERC_KCAL', 'kcal')}
                    </td>
                    <td className="px-3 py-2">
                      {food.own ? (
                        <StatusBadge tone="info">Propio</StatusBadge>
                      ) : (
                        sourceLabel(food.sourceCode)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </div>
  );
}
