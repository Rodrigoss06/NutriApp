'use client';

import type { PhysicalActivity, PhysicalActivityListResponse } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

/** La API devuelve hasta 50 actividades por búsqueda; se muestran de 10 en 10. */
const PAGE = 10;
const API_LIMIT = 50;

const decimals = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** El MET tal como lo publica el Compendium: es un insumo, no un resultado. */
const formatMet = (met: number): string => decimals.format(met);

/**
 * Buscador de actividades del Compendium 2024 con su MET (RN-E03), sin importar las tildes: las que contienen el término
 * entero van primero. Lo usan la Biblioteca y la prescripción energética, que agrega cada una con action.
 */
export function ActivitySearch({
  action,
}: {
  /** Lo que se puede hacer con cada actividad encontrada, como agregarla a una prescripción. */
  action?: (activity: PhysicalActivity) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const query = useDebounced(search.trim(), 250);
  const found = useQuery({
    queryKey: ['physical-activities', query],
    queryFn: () =>
      apiFetch<PhysicalActivityListResponse>(`/physical-activities?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
  const activities = found.data?.activities ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-md">
        <TextField
          label="Buscar actividad"
          type="search"
          autoComplete="off"
          hint="Compendium 2024: escribe al menos 2 letras, sin importar las tildes."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShown(PAGE);
          }}
        />
      </div>
      {query.length < 2 ? null : found.isError ? (
        <FormError error={found.error} title="No pudimos buscar actividades" />
      ) : !found.data ? (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {activities.length === API_LIMIT
              ? `Las ${String(API_LIMIT)} más parecidas: escribe más palabras para afinar.`
              : `${String(activities.length)} ${activities.length === 1 ? 'actividad' : 'actividades'}.`}
          </p>
          <ul
            aria-label="Actividades encontradas"
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
          >
            {activities.slice(0, shown).map((activity) => (
              <li
                key={activity.code}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm">{activity.descriptionEs}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {activity.majorHeading} · {formatMet(activity.met)} MET · {activity.code}
                  </span>
                </span>
                {action ? action(activity) : null}
              </li>
            ))}
          </ul>
          {activities.length > shown ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShown((current) => current + PAGE);
                }}
              >
                Mostrar {Math.min(PAGE, activities.length - shown)} más
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
