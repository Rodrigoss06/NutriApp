'use client';

import type { RecipeListResponse, RecipeStatus } from '@nutricoach/contracts';
import { buttonVariants, EmptyState, Select } from '@nutricoach/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CookingPot, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatServingsCount, formatTotal } from '@/features/food/format';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { TableScroll } from '@/features/shell/table-scroll';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

const LIMIT = 50;

/**
 * El recetario de la organización (RF-21): la búsqueda va mientras se escribe, sin importar las tildes, y queda en la
 * dirección para volver a ella desde el detalle. Las archivadas se ven aparte.
 */
export function RecipeBrowser() {
  const canWrite = useCanWrite();
  const searchParams = useSearchParams();
  const [text, setText] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<RecipeStatus>(() =>
    searchParams.get('estado') === 'archivadas' ? 'ARCHIVED' : 'ACTIVE',
  );
  const query = useDebounced(text.trim(), 250);
  useEffect(() => {
    const params = new URLSearchParams({
      ...(query ? { q: query } : {}),
      ...(status === 'ARCHIVED' ? { estado: 'archivadas' } : {}),
    }).toString();
    window.history.replaceState(null, '', params ? `?${params}` : window.location.pathname);
  }, [query, status]);
  const found = useQuery({
    queryKey: ['recipes', query, status],
    queryFn: () =>
      apiFetch<RecipeListResponse>(
        `/recipes?${new URLSearchParams({ ...(query ? { q: query } : {}), status, limit: String(LIMIT) }).toString()}`,
      ),
    placeholderData: keepPreviousData,
  });
  const recipes = found.data?.recipes ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1" role="search" aria-label="Recetario">
          <TextField
            label="Buscar receta"
            type="search"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </div>
        <div className="sm:w-48">
          <Select
            label="Mostrar"
            value={status}
            onValueChange={(value) => {
              setStatus(value as RecipeStatus);
            }}
            options={[
              { value: 'ACTIVE', label: 'Activas' },
              { value: 'ARCHIVED', label: 'Archivadas' },
            ]}
          />
        </div>
        {canWrite ? (
          <Link href="/panel/biblioteca/recetas/nueva" className={buttonVariants()}>
            <Plus aria-hidden />
            Nueva receta
          </Link>
        ) : null}
      </div>
      {found.isError ? (
        <FormError error={found.error} title="No pudimos buscar recetas" />
      ) : !found.data ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title={query ? 'Sin resultados' : 'Todavía no hay recetas'}
          description={
            query
              ? `No encontramos recetas con «${query}».`
              : 'Crea la primera: el motor calcula sus nutrientes por porción.'
          }
        />
      ) : (
        <TableScroll label="Recetas encontradas">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Recetas encontradas</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Receta
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Porciones
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Ingredientes
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Energía por porción
                </th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe) => (
                <tr key={recipe.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/panel/biblioteca/recetas/${recipe.id}`}
                      className="font-medium text-brand-text underline"
                    >
                      {recipe.name}
                    </Link>
                    {recipe.tags.length > 0 ? (
                      <span className="block text-muted-foreground">{recipe.tags.join(', ')}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatServingsCount(recipe.servings)}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                    {recipe.ingredientCount}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatTotal(recipe.energyKcalPerServing, 'ENERC_KCAL', 'kcal')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}
