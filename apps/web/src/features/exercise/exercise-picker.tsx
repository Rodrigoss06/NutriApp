'use client';

import {
  MOVEMENT_PATTERN_LABELS,
  type ExerciseListResponse,
  type ExerciseRef,
  type MovementPatternCode,
} from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

/** Elegir un ejercicio de la biblioteca buscándolo: la alternativa, la regresión, la progresión o una sustitución. */
export function ExercisePicker({
  label,
  value,
  pattern,
  exclude,
  onChange,
}: {
  label: string;
  value: ExerciseRef | null;
  /** Si solo valen los de un patrón. */
  pattern?: MovementPatternCode;
  /** El ejercicio que se edita: no puede elegirse a sí mismo. */
  exclude?: string;
  onChange: (exercise: ExerciseRef | null) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 250);
  const params = new URLSearchParams({ q: query, limit: '8' });
  if (pattern) params.set('pattern', pattern);
  const found = useQuery({
    queryKey: ['exercises', 'picker', params.toString()],
    queryFn: () => apiFetch<ExerciseListResponse>(`/exercises?${params.toString()}`),
    enabled: query.length >= 2,
  });
  const options = (found.data?.exercises ?? []).filter(({ id }) => id !== exclude);

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm">{value.name}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Quitar ${label.toLowerCase()}`}
            onClick={() => {
              onChange(null);
            }}
          >
            Quitar
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={label}
        type="search"
        autoComplete="off"
        hint={
          pattern
            ? `De ${MOVEMENT_PATTERN_LABELS[pattern].toLowerCase()}. Escribe al menos 2 letras.`
            : 'Escribe al menos 2 letras.'
        }
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <FormError error={found.error} title="No pudimos buscar ejercicios" />
      {found.data && query.length >= 2 ? (
        options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <ul
            aria-label={`Resultados para ${label.toLowerCase()}`}
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
          >
            {options.map((exercise) => (
              <li
                key={exercise.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm">{exercise.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label={`Elegir ${exercise.name}`}
                  onClick={() => {
                    onChange({ id: exercise.id, name: exercise.name });
                    setSearch('');
                  }}
                >
                  Elegir
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
