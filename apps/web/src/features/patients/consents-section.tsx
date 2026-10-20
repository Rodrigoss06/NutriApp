'use client';

import type { Consent, ConsentDocument, PatientResponse } from '@nutricoach/contracts';
import {
  Button,
  ConfirmDialog,
  describedBy,
  FieldMessages,
  Label,
  Notice,
  Select,
  StatusBadge,
} from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch, apiUpload } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { ConsentText } from './consent-text';
import { checkEvidence, EVIDENCE_ACCEPT } from './evidence';
import { CONSENT_CHANNEL_LABELS, CONSENT_PURPOSE_LABELS } from './labels';

type Channel = 'IN_PERSON_DIGITAL' | 'PAPER_SCANNED';

/**
 * Consentimiento informado (RF-05, RN-B01): en consulta, digital o en papel con su escaneo, que se valida en el
 * navegador antes de subirlo (tipo y 5 MB) y otra vez en la API. Para un menor de 14 solo vale el papel firmado por su
 * padre, madre o tutor (ADR-042). Revocar no borra: queda la fecha.
 */
export function ConsentsSection({
  patient,
  consents,
  documents,
}: {
  patient: PatientResponse;
  consents: readonly Consent[];
  documents: readonly ConsentDocument[];
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite() && patient.status === 'ACTIVE';
  const guardian = patient.ageYears < 14;
  const active = consents.filter((c) => c.revokedAt === null);
  const available = documents.filter((d) => !active.some((c) => c.purpose === d.purpose));
  const [documentId, setDocumentId] = useState('');
  const [channel, setChannel] = useState<Channel>(guardian ? 'PAPER_SCANNED' : 'IN_PERSON_DIGITAL');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileId = useId();
  const selected = available.find((d) => d.id === documentId);
  const grant = useMutation({
    mutationFn: (form: FormData) =>
      apiUpload<{ id: string }>(`/patients/${patient.id}/consents`, form),
    onSuccess: () => {
      setDocumentId('');
      setFile(null);
      router.refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (consentId: string) =>
      apiFetch(`/patients/${patient.id}/consents/${consentId}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      router.refresh();
    },
  });

  const onFile = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0] ?? null;
    setFile(null);
    setFileError(null);
    if (!chosen) return;
    const problem = await checkEvidence(chosen);
    if (problem) {
      setFileError(problem);
      input.value = '';
      return;
    }
    setFile(chosen);
  };

  const submit = () => {
    setFormError(null);
    if (!selected) {
      setFormError('Elige qué consentimiento registras.');
      return;
    }
    if (channel === 'PAPER_SCANNED' && !file) {
      setFormError('Adjunta el escaneo del consentimiento firmado.');
      return;
    }
    const form = new FormData();
    form.set('consentDocumentId', selected.id);
    form.set('channel', channel);
    if (channel === 'PAPER_SCANNED' && file) form.set('evidence', file);
    grant.mutate(form);
  };

  return (
    <div className="flex flex-col gap-6">
      <FormError error={revoke.error} title="No se revocó" />
      {consents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin consentimientos: solo existen los datos para crear la ficha e invitar (RN-B01).
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {consents.map((consent) => (
            <li key={consent.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{CONSENT_PURPOSE_LABELS[consent.purpose]}</span>
                  {consent.revokedAt ? (
                    <StatusBadge tone="warning">Revocado</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Vigente</StatusBadge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {CONSENT_CHANNEL_LABELS[consent.channel]} · versión {consent.documentVersion} ·
                  otorgado el {formatInstant(consent.grantedAt, timezone)}
                  {consent.revokedAt
                    ? ` · revocado el ${formatInstant(consent.revokedAt, timezone)}`
                    : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {consent.hasEvidence ? (
                  <a
                    href={`/api/v1/patients/${patient.id}/consents/${consent.id}/evidence`}
                    className="inline-flex h-9 items-center px-3 text-sm font-medium text-brand-text underline"
                  >
                    Descargar evidencia
                  </a>
                ) : null}
                {consent.revokedAt ? null : (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" disabled={!canWrite || revoke.isPending}>
                        Revocar
                      </Button>
                    }
                    title={`¿Revocar «${CONSENT_PURPOSE_LABELS[consent.purpose]}»?`}
                    description="Bloquea los registros nuevos; lo existente queda en solo lectura. Si es de datos de salud o de uso de la app, se cierran sus sesiones en la app (RN-B02)."
                    confirmLabel="Revocar"
                    tone="danger"
                    onConfirm={() => {
                      revoke.mutate(consent.id);
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form
          noValidate
          aria-label="Registrar un consentimiento"
          className="flex flex-col gap-4 rounded-lg border border-border p-4 bg-card"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <h3 className="font-semibold">Registrar en consulta</h3>
          {guardian ? (
            <Notice tone="warning" title="Menor de 14 años">
              Solo vale el consentimiento en papel firmado por su padre, madre o tutor, con su
              escaneo.
            </Notice>
          ) : null}
          <FormError error={grant.error} title="No se registró el consentimiento" />
          {formError ? <Notice tone="danger" title={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Consentimiento"
              value={documentId || undefined}
              placeholder="Elige uno"
              disabled={!canWrite}
              onValueChange={setDocumentId}
              options={available.map((d) => ({
                value: d.id,
                label: CONSENT_PURPOSE_LABELS[d.purpose],
              }))}
            />
            <Select
              label="Cómo se otorga"
              value={channel}
              disabled={!canWrite || guardian}
              onValueChange={(value) => {
                setChannel(value as Channel);
              }}
              options={(['IN_PERSON_DIGITAL', 'PAPER_SCANNED'] as const).map((value) => ({
                value,
                label: CONSENT_CHANNEL_LABELS[value],
              }))}
            />
          </div>
          {selected ? (
            <div className="flex flex-col gap-2 rounded-md bg-surface p-3">
              {selected.provisional ? (
                <StatusBadge tone="warning">
                  Texto provisional, pendiente de revisión legal
                </StatusBadge>
              ) : null}
              <ConsentText markdown={selected.bodyMarkdown} />
              <p className="text-xs text-muted-foreground">Versión {selected.version}</p>
            </div>
          ) : null}
          {channel === 'PAPER_SCANNED' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fileId}>Escaneo firmado</Label>
              <input
                id={fileId}
                type="file"
                accept={EVIDENCE_ACCEPT}
                disabled={!canWrite}
                aria-invalid={fileError ? true : undefined}
                aria-describedby={describedBy(fileId, 'PDF, JPG o PNG de hasta 5 MB.', fileError)}
                onChange={(event) => {
                  void onFile(event.currentTarget);
                }}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-brand-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-text"
              />
              <FieldMessages id={fileId} hint="PDF, JPG o PNG de hasta 5 MB." error={fileError} />
            </div>
          ) : null}
          <div>
            <Button type="submit" disabled={!canWrite || grant.isPending}>
              {grant.isPending ? 'Registrando…' : 'Registrar consentimiento'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
