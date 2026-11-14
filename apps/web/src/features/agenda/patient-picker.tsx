'use client';

import { Button, Input, Label } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useId, useState } from 'react';
import { searchPatients } from './agenda-api';

export interface PickedPatient {
  readonly id: string;
  readonly name: string;
}

/**
 * Elegir el paciente de una cita por nombre o documento (RF-08): solo aparecen los que el profesional ve (RN-A05). Sin paciente, la
 * cita queda en la agenda sin expediente.
 */
export function PatientPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const results = useQuery({
    queryKey: ['agenda-patients', deferred],
    queryFn: () => searchPatients(deferred),
    enabled: deferred.length >= 2 && value === null,
    staleTime: 30_000,
  });
  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{value.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
          >
            Cambiar<span className="sr-only"> el paciente de la cita</span>
          </Button>
        </p>
      </div>
    );
  }
  const patients = results.data?.patients ?? [];
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Escribe al menos 2 letras del nombre o el documento"
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {deferred.length >= 2 ? (
        <ul
          aria-label={`Resultados para «${deferred}»`}
          className="flex flex-col gap-1"
          aria-live="polite"
        >
          {results.isFetching && patients.length === 0 ? (
            <li className="text-sm text-muted-foreground">Buscando…</li>
          ) : null}
          {!results.isFetching && patients.length === 0 ? (
            <li className="text-sm text-muted-foreground">Sin resultados.</li>
          ) : null}
          {patients.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center justify-between rounded-md border border-border px-3 text-left hover:bg-muted"
                onClick={() => {
                  onChange({ id: patient.id, name: `${patient.firstName} ${patient.lastName}` });
                }}
              >
                <span>
                  {patient.firstName} {patient.lastName}
                </span>
                <span className="text-sm text-muted-foreground">{patient.code}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
