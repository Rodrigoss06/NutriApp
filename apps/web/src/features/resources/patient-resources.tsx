'use client';

import type {
  AssignedResources,
  CareTeamMember,
  MemberResponse,
  ResourceList,
} from '@nutricoach/contracts';
import { Button, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { RESOURCES_KEY } from './resource-library';
import { RESOURCE_KIND_LABELS } from './resource-view';

/**
 * El material asignado a un paciente (RF-30, ADR-094): su equipo de atención con acceso de escritura lo asigna desde la biblioteca o
 * lo quita (RN-A05), y ve si ya lo abrió en su app.
 */
export function PatientResources({
  patientId,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const { timezone } = usePanelSession();
  const writesRecord = useWritesRecord(careTeam, members);
  const organizationWrites = useCanWrite();
  const canWrite = writesRecord && organizationWrites && !archived;
  const client = useQueryClient();
  const key = ['patient-resources', patientId];
  const assigned = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<AssignedResources>(`/patients/${patientId}/resources`),
  });
  const library = useQuery({
    queryKey: [...RESOURCES_KEY, 'ACTIVE'],
    queryFn: () => apiFetch<ResourceList>('/resources?status=ACTIVE'),
    enabled: canWrite,
  });
  const [choice, setChoice] = useState('');
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: RESOURCES_KEY });
  };
  const assign = useMutation({
    mutationFn: (resourceId: string) =>
      apiFetch<undefined>(`/patients/${patientId}/resources`, {
        method: 'POST',
        body: { resourceId },
      }),
    onSuccess: async () => {
      setChoice('');
      await refresh();
    },
  });
  const unassign = useMutation({
    mutationFn: (resourceId: string) =>
      apiFetch<undefined>(`/patients/${patientId}/resources/${resourceId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const taken = new Set(assigned.data?.resources.map((resource) => resource.id));
  const options = (library.data?.resources ?? [])
    .filter((resource) => !taken.has(resource.id))
    .map((resource) => ({
      value: resource.id,
      label: `${resource.title} · ${RESOURCE_KIND_LABELS[resource.kind]}`,
    }));

  return (
    <div className="flex flex-col gap-4">
      {assigned.isError ? <Notice tone="danger" title="No pudimos cargar su material" /> : null}
      {assigned.data?.resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tiene material asignado.</p>
      ) : null}
      {assigned.data && assigned.data.resources.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Material asignado">
          {assigned.data.resources.map((resource) => (
            <li
              key={resource.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{resource.title}</span>
                  <StatusBadge tone="info">{RESOURCE_KIND_LABELS[resource.kind]}</StatusBadge>
                  {resource.status === 'ARCHIVED' ? (
                    <StatusBadge tone="warning">Archivado: no lo ve</StatusBadge>
                  ) : resource.viewedAt ? (
                    <StatusBadge tone="success">Abierto</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">Sin abrir</StatusBadge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Asignado el {formatInstant(resource.assignedAt, timezone)}
                  {resource.viewedAt
                    ? ` · abierto el ${formatInstant(resource.viewedAt, timezone)}`
                    : ''}
                </p>
              </div>
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={unassign.isPending}
                  onClick={() => {
                    unassign.mutate(resource.id);
                  }}
                >
                  Quitar<span className="sr-only"> {resource.title}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <FormError error={unassign.error} title="No se quitó el material" />
      {canWrite ? (
        options.length > 0 ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (choice) assign.mutate(choice);
            }}
          >
            <Select
              label="Material de la biblioteca"
              options={options}
              value={choice}
              onValueChange={setChoice}
              placeholder="Elige uno"
              className="sm:min-w-80"
            />
            <Button type="submit" disabled={!choice || assign.isPending}>
              Asignar
            </Button>
          </form>
        ) : library.data ? (
          <p className="text-sm text-muted-foreground">
            No queda material por asignar.{' '}
            <Link href="/panel/biblioteca/material" className="text-brand-text underline">
              Agrega más en la Biblioteca
            </Link>
            .
          </p>
        ) : null
      ) : null}
      <FormError error={assign.error} title="No se asignó el material" />
    </div>
  );
}
