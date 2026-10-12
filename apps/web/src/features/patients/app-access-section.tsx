'use client';

import type { PatientResponse } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';

/**
 * Acceso a la app (RN-A06): una invitación de un solo uso al correo del paciente. Reenviar anula el enlace anterior.
 * Un menor de 14 años solo se invita con los consentimientos firmados en papel por su padre, madre o tutor (ADR-042).
 */
export function AppAccessSection({ patient }: { patient: PatientResponse }) {
  const router = useRouter();
  const { timezone, patientLabel } = usePanelSession();
  const canWrite = useCanWrite() && patient.status === 'ACTIVE';
  const [email, setEmail] = useState(patient.appAccess.invitation?.email ?? patient.email ?? '');
  const invite = useMutation({
    mutationFn: (to: string) =>
      apiFetch<{ id: string }>(`/patients/${patient.id}/invitation`, {
        method: 'POST',
        body: to ? { email: to } : {},
      }),
    onSuccess: () => {
      router.refresh();
    },
  });

  if (patient.appAccess.linked) {
    return (
      <Notice tone="success" title="Tiene acceso a la app">
        Entra con su correo y la contraseña que eligió. Revocar el consentimiento de uso de la app o
        el de datos de salud cierra sus sesiones.
      </Notice>
    );
  }
  const pending = patient.appAccess.invitation;
  return (
    <div className="flex flex-col gap-4">
      {patient.ageYears < 14 ? (
        <Notice tone="warning" title="Menor de 14 años">
          Su padre, madre o tutor firma en papel los consentimientos de datos de salud y de uso de
          la app; regístralos escaneados antes de invitarlo.
        </Notice>
      ) : null}
      {pending ? (
        <p className="text-sm">
          Invitación enviada a <span className="font-medium">{pending.email}</span>.{' '}
          {new Date(pending.expiresAt) <= new Date() ? 'Venció' : 'Vence'} el{' '}
          {formatInstant(pending.expiresAt, timezone)}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aún no tiene acceso. Le llegará un correo con un enlace para crear su contraseña; nadie
          del equipo la conoce.
        </p>
      )}
      <FormError error={invite.error} title="No se envió la invitación" />
      {invite.isSuccess ? (
        <Notice tone="success" title="Invitación enviada">
          El enlace llega al correo del {patientLabel.toLowerCase()} y sirve una sola vez.
        </Notice>
      ) : null}
      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={submitWith((event) => {
          event?.preventDefault();
          invite.mutate(email.trim());
          return Promise.resolve();
        })}
      >
        <div className="flex-1">
          <TextField
            label="Correo para la app"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            disabled={!canWrite}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </div>
        <Button type="submit" disabled={!canWrite || invite.isPending}>
          {pending ? 'Reenviar invitación' : 'Invitar a la app'}
        </Button>
      </form>
    </div>
  );
}
