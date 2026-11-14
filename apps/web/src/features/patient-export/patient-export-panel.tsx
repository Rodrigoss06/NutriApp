'use client';

import {
  PATIENT_EXPORT_STATUS_LABELS,
  type PatientExport,
  type PatientExportListResponse,
} from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { formatBytes, hasPending } from './export-view';

/**
 * La exportación de los datos de un paciente (RF-07, RN-B04; ADR-131, ADR-132): pedirla, ver cómo va y descargar el ZIP mientras
 * dura (24 horas). La comparten el panel (`/patients/:id/exports`) y la app del paciente (`/me/exports`). Mientras una se prepara,
 * vuelve a preguntar cada 3 segundos. La descarga va por la API, con sesión, como adjunto.
 */
export function PatientExportPanel({
  endpoint,
  initial,
  timezone,
  size = 'md',
}: {
  /** Sin /api/v1: `/patients/:id/exports` o `/me/exports`. */
  endpoint: string;
  initial: PatientExportListResponse;
  /** La del panel; sin ella, la del paciente que trae la respuesta (la app). */
  timezone?: string;
  /** touch en la app del paciente: 44 px (06 §8). */
  size?: 'md' | 'touch';
}) {
  const queryClient = useQueryClient();
  const queryKey = ['patient-exports', endpoint];
  const list = useQuery({
    queryKey,
    queryFn: () => apiFetch<PatientExportListResponse>(endpoint),
    initialData: initial,
    refetchInterval: (query) => (hasPending(query.state.data?.exports ?? []) ? 3000 : false),
  });
  const request = useMutation({
    mutationFn: () =>
      apiFetch<PatientExport>(endpoint, {
        method: 'POST',
        headers: { 'Idempotency-Key': `patient-export:${crypto.randomUUID()}` },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const exports = list.data.exports;
  const zone = timezone ?? list.data.timezone;
  const pending = hasPending(exports);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          type="button"
          size={size}
          disabled={pending || request.isPending}
          onClick={() => {
            request.mutate();
          }}
        >
          {pending || request.isPending ? 'Preparando la exportación…' : 'Preparar la exportación'}
        </Button>
      </div>
      <FormError error={request.error} title="No se pidió la exportación" />
      {exports.length === 0 ? null : (
        <ul
          aria-label="Exportaciones"
          aria-live="polite"
          className="divide-y divide-border rounded-lg border border-border bg-card"
        >
          {exports.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{PATIENT_EXPORT_STATUS_LABELS[item.status]}</span>
                <span className="text-sm text-muted-foreground">{detailOf(item, zone)}</span>
              </div>
              {item.status === 'READY' ? (
                <Button asChild variant="secondary" size={size}>
                  <a href={`/api/v1${endpoint}/${item.id}/file`} download>
                    <Download aria-hidden className="size-4" />
                    Descargar el ZIP
                    {item.sizeBytes ? ` (${formatBytes(item.sizeBytes)})` : ''}
                  </a>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function detailOf(item: PatientExport, timezone: string): string {
  const asked = `Pedida el ${formatInstant(item.createdAt, timezone)}`;
  switch (item.status) {
    case 'PENDING':
      return `${asked}. Tarda unos segundos.`;
    case 'READY':
      return item.expiresAt
        ? `${asked}. Se descarga hasta el ${formatInstant(item.expiresAt, timezone)}.`
        : asked;
    case 'EXPIRED':
      return item.expiresAt
        ? `${asked}. Venció el ${formatInstant(item.expiresAt, timezone)}: pide otra.`
        : `${asked}. Venció: pide otra.`;
    case 'FAILED':
      return `${asked}. Pide otra.`;
  }
}
