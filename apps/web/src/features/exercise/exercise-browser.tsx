'use client';

import {
  FULL_GYM_EQUIPMENT,
  MOVEMENT_PATTERN_LABELS,
  TRAINING_LEVEL_LABELS,
  TRAINING_LEVELS,
  type ExerciseCatalogResponse,
  type ExerciseListResponse,
} from '@nutricoach/contracts';
import { buttonVariants, EmptyState, Select, StatusBadge } from '@nutricoach/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Dumbbell, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { TableScroll } from '@/features/shell/table-scroll';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

const LIMIT = 100;
/** Radix no admite una opción con valor vacío. */
const ALL = 'ALL';

const FILTERS = ['pattern', 'level', 'equipment', 'muscle'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * La biblioteca de ejercicios (RF-25): de referencia y propios, con búsqueda sin tildes y por alias y filtros por patrón,
 * nivel, equipo y músculo. Todo queda en la dirección para volver a ella desde la ficha.
 */
export function ExerciseBrowser({ catalog }: { catalog: ExerciseCatalogResponse }) {
  const canWrite = useCanWrite();
  const searchParams = useSearchParams();
  const [text, setText] = useState(() => searchParams.get('q') ?? '');
  const [filters, setFilters] = useState<Record<Filter, string>>(() => ({
    pattern: searchParams.get('pattern') ?? ALL,
    level: searchParams.get('level') ?? ALL,
    equipment: searchParams.get('equipment') ?? ALL,
    muscle: searchParams.get('muscle') ?? ALL,
  }));
  const query = useDebounced(text.trim(), 250);
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  for (const filter of FILTERS) {
    if (filters[filter] !== ALL) params.set(filter, filters[filter]);
  }
  const shown = params.toString();
  useEffect(() => {
    window.history.replaceState(null, '', shown ? `?${shown}` : window.location.pathname);
  }, [shown]);
  const found = useQuery({
    queryKey: ['exercises', shown],
    queryFn: () =>
      apiFetch<ExerciseListResponse>(
        `/exercises?${shown ? `${shown}&` : ''}limit=${String(LIMIT)}`,
      ),
    placeholderData: keepPreviousData,
  });
  const exercises = found.data?.exercises ?? [];
  const setFilter = (filter: Filter) => (value: string) => {
    setFilters((current) => ({ ...current, [filter]: value }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1" role="search" aria-label="Biblioteca de ejercicios">
          <TextField
            label="Buscar ejercicio"
            type="search"
            autoComplete="off"
            hint="Sin importar las tildes, y también por otros nombres: «RDL», «lagartija»."
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </div>
        {canWrite ? (
          <Link href="/panel/biblioteca/ejercicios/nuevo" className={buttonVariants()}>
            <Plus aria-hidden />
            Nuevo ejercicio propio
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Select
          label="Patrón"
          value={filters.pattern}
          onValueChange={setFilter('pattern')}
          options={[
            { value: ALL, label: 'Todos' },
            ...catalog.patterns.map(({ code, name }) => ({ value: code, label: name })),
          ]}
        />
        <Select
          label="Nivel"
          value={filters.level}
          onValueChange={setFilter('level')}
          options={[
            { value: ALL, label: 'Todos' },
            ...TRAINING_LEVELS.map((level) => ({
              value: level,
              label: TRAINING_LEVEL_LABELS[level],
            })),
          ]}
        />
        <Select
          label="Equipo"
          value={filters.equipment}
          onValueChange={setFilter('equipment')}
          options={[
            { value: ALL, label: 'Todos' },
            ...catalog.equipment
              .filter(({ code }) => code !== FULL_GYM_EQUIPMENT)
              .map(({ code, name }) => ({ value: code, label: name })),
          ]}
        />
        <Select
          label="Músculo"
          value={filters.muscle}
          onValueChange={setFilter('muscle')}
          options={[
            { value: ALL, label: 'Todos' },
            ...catalog.muscles.map(({ code, name }) => ({ value: code, label: name })),
          ]}
        />
      </div>
      {found.isError ? (
        <FormError error={found.error} title="No pudimos buscar ejercicios" />
      ) : !found.data ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin resultados"
          description="No encontramos ejercicios con esa búsqueda. Prueba con menos filtros o crea uno propio."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {exercises.length === LIMIT
              ? `Los ${String(LIMIT)} primeros: afina la búsqueda o los filtros.`
              : `${String(exercises.length)} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'}.`}
          </p>
          <TableScroll label="Ejercicios encontrados">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Ejercicios encontrados</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Ejercicio
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Patrón
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nivel
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Equipo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Músculo principal
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Fuente
                  </th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => (
                  <tr key={exercise.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={`/panel/biblioteca/ejercicios/${exercise.id}`}
                        className="font-medium text-brand-text underline"
                      >
                        {exercise.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{MOVEMENT_PATTERN_LABELS[exercise.pattern]}</td>
                    <td className="px-3 py-2">{TRAINING_LEVEL_LABELS[exercise.level]}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {exercise.equipmentName ?? '—'}
                    </td>
                    <td className="px-3 py-2">{exercise.primaryMuscles.join(', ')}</td>
                    <td className="px-3 py-2">
                      {exercise.own ? (
                        <StatusBadge tone="info">Propio</StatusBadge>
                      ) : exercise.provisional ? (
                        <StatusBadge tone="warning">Provisional</StatusBadge>
                      ) : (
                        'De referencia'
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
