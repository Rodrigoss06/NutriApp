'use client';

import type { OrganizationResponse, UpdateOrganization } from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCan, useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';

interface Values {
  name: string;
  legalName: string;
  taxId: string;
  timezone: string;
  patientLabel: string;
  patientVisibility: 'CARE_TEAM' | 'ORGANIZATION';
}

const toValues = (o: OrganizationResponse): Values => ({
  name: o.name,
  legalName: o.legalName ?? '',
  taxId: o.taxId ?? '',
  timezone: o.timezone,
  patientLabel: o.patientLabel,
  patientVisibility: o.patientVisibility,
});

/** Datos de la organización (RF-02) con bloqueo optimista: If-Match con la versión leída; 409 si cambió. */
export function OrganizationForm({ organization }: { organization: OrganizationResponse }) {
  const router = useRouter();
  const { manage } = useCan();
  const canWrite = useCanWrite();
  const form = useForm<Values>({ values: toValues(organization) });
  const save = useMutation({
    mutationFn: (values: Values) =>
      apiFetch<OrganizationResponse>('/organization', {
        method: 'PATCH',
        headers: { 'If-Match': `"${String(organization.version)}"` },
        body: {
          name: values.name,
          legalName: values.legalName.trim() || null,
          taxId: values.taxId.trim() || null,
          timezone: values.timezone,
          patientLabel: values.patientLabel,
          patientVisibility: values.patientVisibility,
        } satisfies UpdateOrganization,
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const disabled = !manage || !canWrite;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      {conflict ? (
        <Notice tone="warning" title="Alguien cambió estos datos mientras los editabas">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              save.reset();
              router.refresh();
            }}
          >
            Cargar la versión actual
          </Button>
        </Notice>
      ) : (
        <FormError error={save.error} />
      )}
      {save.isSuccess ? <Notice tone="success" title="Cambios guardados" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombre"
          disabled={disabled}
          {...form.register('name', { required: true })}
        />
        <TextField label="Razón social" disabled={disabled} {...form.register('legalName')} />
        <TextField
          label="RUC"
          inputMode="numeric"
          disabled={disabled}
          {...form.register('taxId')}
        />
        <TextField label="Zona horaria" disabled={disabled} {...form.register('timezone')} />
        <TextField
          label="Cómo llaman a sus pacientes"
          hint="Por ejemplo: Paciente, Asesorado o Cliente."
          disabled={disabled}
          {...form.register('patientLabel')}
        />
        <Controller
          control={form.control}
          name="patientVisibility"
          render={({ field }) => (
            <Select
              label="Quién ve a cada paciente"
              value={field.value}
              disabled={disabled}
              onValueChange={field.onChange}
              options={[
                { value: 'CARE_TEAM', label: 'Solo su equipo de atención' },
                { value: 'ORGANIZATION', label: 'Toda la organización' },
              ]}
            />
          )}
        />
      </div>
      {manage ? (
        <div>
          <Button type="submit" disabled={disabled || save.isPending}>
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </form>
  );
}
