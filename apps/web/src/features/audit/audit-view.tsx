'use client';

import type { AuditEvent, AuditEventListResponse, MemberResponse } from '@nutricoach/contracts';
import { Button, DataTable, Notice, Select } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { AUDIT_ACTION_LABELS, AUDIT_RESOURCE_LABELS } from '@/features/patients/labels';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';
import { addDays, dayStartIn, formatInstant, todayIn } from '@/lib/dates';

const ALL = 'ALL';
const MAX_DAYS = 90;
const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  SUCCESS: 'Correcto',
  DENIED: 'Denegado',
  FAILURE: 'Falló',
};

interface Filters {
  readonly from: string;
  readonly to: string;
  readonly userId: string;
  readonly action: string;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Los días elegidos en la zona de la organización, como instantes para la API. */
export function auditQuery(
  filters: Filters,
  timeZone: string,
  patientId: string | null,
): URLSearchParams {
  const params = new URLSearchParams({
    from: dayStartIn(filters.from, timeZone).toISOString(),
    to: new Date(dayStartIn(addDays(filters.to, 1), timeZone).getTime() - 1).toISOString(),
    limit: '50',
  });
  if (filters.userId !== ALL) params.set('userId', filters.userId);
  if (filters.action !== ALL) params.set('action', filters.action);
  if (patientId) params.set('patientId', patientId);
  return params;
}

/**
 * Auditoría de la organización para su dueño (RF-06, RN-B03): quién leyó o cambió qué y cuándo. Rango de fechas de
 * 90 días como máximo, para que la consulta use las particiones. La API decide quién la ve.
 */
export function AuditView({
  members,
  patientId,
}: {
  members: readonly MemberResponse[];
  patientId: string | null;
}) {
  const { timezone } = usePanelSession();
  const today = todayIn(timezone);
  const [filters, setFilters] = useState<Filters>({
    from: addDays(today, -6),
    to: today,
    userId: ALL,
    action: ALL,
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const form = useForm<Filters>({ defaultValues: filters });
  const params = auditQuery(filters, timezone, patientId);
  if (cursor) params.set('cursor', cursor);
  const result = useQuery({
    queryKey: ['audit-events', params.toString()],
    queryFn: () => apiFetch<AuditEventListResponse>(`/audit-events?${params.toString()}`),
    retry: false,
  });
  const forbidden = result.error instanceof ApiError && result.error.status === 403;
  const { errors } = form.formState;

  if (forbidden) {
    return (
      <Notice tone="warning" title="Solo el dueño de la organización ve la auditoría">
        Pídeselo si necesitas saber quién leyó o cambió un expediente.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        aria-label="Filtros de la auditoría"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            setCursor(null);
            setFilters(values);
          }),
        )}
      >
        <TextField
          label="Desde"
          type="date"
          max={today}
          error={errors.from?.message}
          {...form.register('from', { required: 'Elige la fecha inicial.' })}
        />
        <TextField
          label="Hasta"
          type="date"
          max={today}
          error={errors.to?.message}
          {...form.register('to', {
            required: 'Elige la fecha final.',
            validate: (to, values) => {
              const days = daysBetween(values.from, to);
              if (days < 0) return 'La fecha final es anterior a la inicial.';
              return days + 1 <= MAX_DAYS || 'El rango es de 90 días como máximo.';
            },
          })}
        />
        <Controller
          control={form.control}
          name="userId"
          render={({ field }) => (
            <Select
              label="Persona"
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: ALL, label: 'Todas las personas' },
                ...members.map((m) => ({ value: m.userId, label: m.displayName })),
              ]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="action"
          render={({ field }) => (
            <Select
              label="Acción"
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: ALL, label: 'Todas las acciones' },
                ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {patientId ? (
        <p className="text-sm">
          Solo un paciente.{' '}
          <Link href="/panel/auditoria" className="text-brand-text underline">
            Ver toda la organización
          </Link>
        </p>
      ) : null}
      {result.isPending ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : result.isError ? (
        <FormError error={result.error} title="No pudimos cargar la auditoría" />
      ) : (
        <DataTable<AuditEvent>
          caption="Eventos de auditoría"
          rows={result.data.events}
          rowKey={(event) => event.id}
          nextCursor={result.data.nextCursor}
          onCursorChange={setCursor}
          empty={<p className="text-sm text-muted-foreground">No hay eventos en ese rango.</p>}
          columns={[
            { key: 'when', header: 'Cuándo', cell: (e) => formatInstant(e.occurredAt, timezone) },
            {
              key: 'who',
              header: 'Persona',
              cell: (e) =>
                e.actorName ?? (e.actorRole === 'SYSTEM' ? 'Sistema' : 'Cuenta sin nombre'),
            },
            {
              key: 'action',
              header: 'Acción',
              cell: (e) =>
                (AUDIT_ACTION_LABELS as Readonly<Record<string, string>>)[e.action] ?? e.action,
            },
            {
              key: 'what',
              header: 'Qué',
              cell: (e) => AUDIT_RESOURCE_LABELS[e.resourceType] ?? e.resourceType,
            },
            {
              key: 'patient',
              header: 'Paciente',
              cell: (e) =>
                e.patientId ? (
                  <Link
                    href={`/panel/pacientes/${e.patientId}`}
                    className="text-brand-text underline"
                  >
                    {e.patientCode ?? 'Ver'}
                  </Link>
                ) : (
                  '—'
                ),
            },
            {
              key: 'outcome',
              header: 'Resultado',
              cell: (e) => OUTCOME_LABELS[e.outcome] ?? e.outcome,
            },
          ]}
        />
      )}
    </div>
  );
}
