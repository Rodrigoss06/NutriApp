'use client';

import type { PatientResponse } from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { Section } from './section';
import { codeMatches } from './suppression-view';

/**
 * «Suprimir sus datos» en la ficha (RN-B05; ADR-133, ADR-134): solo el dueño, solo con el paciente archivado, escribiendo su código y
 * confirmando. Irreversible; antes se ofrece la exportación, que está justo arriba. Ya suprimido, dice cuándo.
 */
export function SuppressionSection({ patient }: { patient: PatientResponse }) {
  const router = useRouter();
  const { role, patientLabel, timezone } = usePanelSession();
  const canWrite = useCanWrite();
  const [code, setCode] = useState('');
  const suppress = useMutation({
    mutationFn: () =>
      apiFetch<undefined>(`/patients/${patient.id}/anonymize`, {
        method: 'POST',
        body: { code: code.trim() },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  if (role !== 'OWNER' || patient.status !== 'ARCHIVED') return null;
  const noun = patientLabel.toLowerCase();

  if (patient.anonymizedAt) {
    return (
      <Section title="Suprimir sus datos">
        <Notice
          tone="info"
          title={`Sus datos se suprimieron el ${formatInstant(patient.anonymizedAt, timezone)}`}
        >
          Quedan solo los números, sin nada que lo identifique. Este {noun} no se puede reactivar.
        </Notice>
      </Section>
    );
  }

  return (
    <Section
      title="Suprimir sus datos"
      description={
        <>
          Es irreversible: su nombre pasa a «Anonimizado», se borran su documento, su teléfono y su
          correo, queda solo el año de nacimiento, se vacía todo lo escrito a mano y se borran sus
          archivos (documentos, fotos, fichas y exportaciones). Quedan los números, sin
          identificación, y su cuenta de la app se desactiva. Si vas a necesitar sus datos,{' '}
          <a href="#seccion-exportar-sus-datos" className="text-brand-text underline">
            expórtalos antes
          </a>
          .
        </>
      }
    >
      <form
        noValidate
        aria-label="Suprimir sus datos"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <TextField
          label={`Escribe el código del ${noun} (${patient.code}) para confirmar`}
          autoComplete="off"
          maxLength={40}
          value={code}
          disabled={!canWrite}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
        <div>
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="danger"
                disabled={!canWrite || !codeMatches(code, patient.code) || suppress.isPending}
              >
                Suprimir para siempre
              </Button>
            }
            title={`¿Suprimir los datos de ${patient.code}?`}
            description="No se puede deshacer: sus datos y sus archivos se borran ahora."
            confirmLabel="Suprimir"
            tone="danger"
            onConfirm={() => {
              suppress.mutate();
            }}
          />
        </div>
        <FormError error={suppress.error} title="No se suprimieron sus datos" />
      </form>
    </Section>
  );
}
