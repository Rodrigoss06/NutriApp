'use client';

import type { AccountResponse, InspectInvitationResponse } from '@nutricoach/contracts';
import { Button, Notice, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  CheckboxField,
  NEW_PASSWORD_HINT,
  PasswordField,
  submitWith,
  TextField,
} from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { ConsentText } from '@/features/patients/consent-text';
import { CONSENT_PURPOSE_LABELS } from '@/features/patients/labels';
import { apiFetch } from '@/lib/api/client';

const purposeLabel = (purpose: string) =>
  (CONSENT_PURPOSE_LABELS as Readonly<Record<string, string>>)[purpose] ?? purpose;

/**
 * El paciente acepta su acceso a la app (RN-A06, RN-B01): una casilla por finalidad, sin marcar, cada una con su
 * texto; solo se piden las que no están vigentes. Un menor de 14 no consiente desde la app: lo firma en consulta su
 * padre, madre o tutor (ADR-042). Al terminar, entra a la app.
 */
export function PatientAcceptance({
  invitation,
  token,
}: {
  invitation: InspectInvitationResponse;
  token: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState<Readonly<Record<string, boolean>>>({});
  const [missing, setMissing] = useState(false);
  const form = useForm<{ password: string }>({ defaultValues: { password: '' } });
  const accept = useMutation({
    mutationFn: (password: string) =>
      apiFetch<AccountResponse>('/invitations/accept', {
        method: 'POST',
        body: {
          token,
          password,
          acceptedConsentDocumentIds: invitation.consents
            .filter((consent) => accepted[consent.id])
            .map((consent) => consent.id),
        },
      }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/mi/hoy');
      router.refresh();
    },
  });
  const title = `Tu acceso a la app de ${invitation.organizationName}`;

  if (invitation.accountExists) {
    return (
      <Notice tone="warning" title={title}>
        Ese correo ya tiene una cuenta. Pide a tu profesional que te invite con otro correo.
      </Notice>
    );
  }
  if (invitation.needsGuardianConsent) {
    return (
      <Notice tone="info" title={title}>
        Como tienes menos de 14 años, tu padre, madre o tutor firma tu consentimiento en la
        consulta. Cuando esté registrado, vuelve a abrir este enlace para crear tu contraseña.
      </Notice>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={submitWith(
        form.handleSubmit(({ password }) => {
          const all = invitation.consents.every((consent) => accepted[consent.id]);
          setMissing(!all);
          if (all) accept.mutate(password);
        }),
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground">
          {invitation.firstName ? `Hola, ${invitation.firstName}. ` : 'Hola. '}
          Crea tu contraseña para ver tu plan y registrar tu día. Nadie del equipo la conoce.
        </p>
      </div>
      <FormError error={accept.error} title="No pudimos crear tu cuenta" />
      {missing ? (
        <Notice tone="danger" title="Acepta cada finalidad">
          Para crear tu cuenta necesitas aceptar el uso de la app y el tratamiento de tus datos de
          salud.
        </Notice>
      ) : null}
      {invitation.consents.length > 0 ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 font-medium">Lee y acepta cada finalidad</legend>
          {invitation.consents.map((consent) => {
            const label = purposeLabel(consent.purpose);
            return (
              <div
                key={consent.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{label}</h3>
                  {consent.provisional ? (
                    <StatusBadge tone="warning">
                      Texto provisional, pendiente de revisión legal
                    </StatusBadge>
                  ) : null}
                </div>
                <ConsentText markdown={consent.bodyMarkdown} />
                <CheckboxField
                  label={`Acepto: ${label.toLowerCase()}`}
                  checked={accepted[consent.id] ?? false}
                  error={
                    missing && !accepted[consent.id]
                      ? 'Acepta esta finalidad para crear tu cuenta.'
                      : undefined
                  }
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setAccepted((current) => ({ ...current, [consent.id]: checked }));
                  }}
                />
              </div>
            );
          })}
        </fieldset>
      ) : null}
      <TextField
        label="Correo"
        type="email"
        autoComplete="username"
        value={invitation.email}
        readOnly
      />
      <PasswordField
        label="Contraseña"
        autoComplete="new-password"
        hint={NEW_PASSWORD_HINT}
        error={form.formState.errors.password?.message}
        {...form.register('password', { required: 'Escribe una contraseña.' })}
      />
      <Button type="submit" size="touch" disabled={accept.isPending}>
        {accept.isPending ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
      </Button>
    </form>
  );
}
