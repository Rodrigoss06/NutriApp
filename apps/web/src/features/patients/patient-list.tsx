'use client';

import type { PatientListResponse, PatientSummary } from '@nutricoach/contracts';
import { Button, DataTable, EmptyState, StatusBadge } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { pluralLabel } from '@/features/organization/labels';
import { apiFetch } from '@/lib/api/client';
import { PATIENT_STATUS_LABELS, POPULATION_LABELS } from './labels';
import { patientQuery } from './search-query';

/**
 * Lista y búsqueda de pacientes (RF-08): con dígitos busca el documento exacto por su índice ciego; si no, el nombre
 * sin tildes. Fuera del equipo de atención, el paciente no aparece (RN-A05).
 */
export function PatientList({
  text,
  archived,
  patientLabel,
}: {
  text: string;
  archived: boolean;
  patientLabel: string;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const plural = pluralLabel(patientLabel).toLowerCase();
  const query = patientQuery(text);
  const search = new URLSearchParams({
    status: archived ? 'ARCHIVED' : 'ACTIVE',
    limit: '25',
    ...(query ?? {}),
    ...(cursor ? { cursor } : {}),
  });
  const result = useQuery({
    queryKey: ['patients', text, archived, cursor],
    queryFn: () => apiFetch<PatientListResponse>(`/patients?${search.toString()}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <Form
        action="/panel/pacientes"
        role="search"
        aria-label={`Buscar en la lista de ${plural}`}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Nombre o documento"
            name="q"
            type="search"
            defaultValue={text}
            hint="Con dígitos se busca el documento exacto; si no, el nombre sin importar las tildes."
          />
        </div>
        {archived ? <input type="hidden" name="estado" value="archivados" /> : null}
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </Form>
      <nav aria-label={`Estado de los ${plural}`} className="flex gap-2">
        <StatusLink href="/panel/pacientes" current={!archived}>
          Activos
        </StatusLink>
        <StatusLink href="/panel/pacientes?estado=archivados" current={archived}>
          Archivados
        </StatusLink>
      </nav>
      {result.isPending ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : result.isError ? (
        <FormError error={result.error} title="No pudimos cargar la lista" />
      ) : (
        <DataTable<PatientSummary>
          caption={pluralLabel(patientLabel)}
          rows={result.data.patients}
          rowKey={(patient) => patient.id}
          nextCursor={result.data.nextCursor}
          onCursorChange={setCursor}
          empty={
            <EmptyState
              icon={Users}
              title={
                text
                  ? 'Sin resultados'
                  : archived
                    ? `No hay ${plural} archivados`
                    : `Todavía no hay ${plural}`
              }
              description={
                text
                  ? `No encontramos ${plural} con «${text}» entre los que puedes ver.`
                  : `Registra el primero con «Nuevo ${patientLabel.toLowerCase()}».`
              }
            />
          }
          columns={[
            { key: 'code', header: 'Código', cell: (patient) => patient.code },
            {
              key: 'name',
              header: 'Nombre',
              cell: (patient) => (
                <Link
                  href={`/panel/pacientes/${patient.id}`}
                  className="font-medium text-brand-text underline"
                >
                  {patient.lastName}, {patient.firstName}
                </Link>
              ),
            },
            {
              key: 'population',
              header: 'Población',
              cell: (patient) => POPULATION_LABELS[patient.population],
            },
            {
              key: 'status',
              header: 'Estado',
              cell: (patient) => (
                <StatusBadge tone={patient.status === 'ACTIVE' ? 'success' : 'info'}>
                  {PATIENT_STATUS_LABELS[patient.status]}
                </StatusBadge>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function StatusLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? 'rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground'
          : 'rounded-md px-3 py-2 text-sm font-medium text-brand-text hover:bg-muted'
      }
    >
      {children}
    </Link>
  );
}
