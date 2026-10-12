'use client';

import {
  DOCUMENT_TYPES,
  POPULATIONS,
  type MemberResponse,
  type RegisterPatient,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { todayIn } from '@/lib/dates';
import { DOCUMENT_TYPE_LABELS, POPULATION_LABELS, SEX_LABELS } from './labels';

interface RegisterValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly sex: string;
  readonly birthDate: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly email: string;
  readonly phone: string;
  readonly population: string;
  readonly responsibleMemberId: string;
}

const NO_DOCUMENT = 'NONE';

/**
 * Alta con los datos mínimos (RF-08, RN-B01): sin consentimiento solo existen los datos para crear la ficha e invitar.
 * La población «obesidad» es un dato de salud: se registra después, con el consentimiento.
 */
export function RegisterPatientForm({ members }: { members: readonly MemberResponse[] }) {
  const router = useRouter();
  const { userId, timezone, patientLabel } = usePanelSession();
  const canWrite = useCanWrite();
  const active = members.filter((m) => m.status === 'ACTIVE');
  const me = active.find((m) => m.userId === userId);
  const form = useForm<RegisterValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      sex: '',
      birthDate: '',
      documentType: NO_DOCUMENT,
      documentNumber: '',
      email: '',
      phone: '',
      population: 'ADULT',
      responsibleMemberId: me?.id ?? active[0]?.id ?? '',
    },
  });
  const register = useMutation({
    mutationFn: (body: RegisterPatient) =>
      apiFetch<{ id: string }>('/patients', { method: 'POST', body }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${id}`);
    },
  });
  const { errors } = form.formState;
  const documentType = useWatch({ control: form.control, name: 'documentType' });
  const required = (message: string) => ({ required: message });

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          register.mutate({
            firstName: values.firstName,
            lastName: values.lastName,
            sex: values.sex as RegisterPatient['sex'],
            birthDate: values.birthDate,
            document:
              values.documentType === NO_DOCUMENT
                ? null
                : {
                    type: values.documentType as (typeof DOCUMENT_TYPES)[number],
                    number: values.documentNumber,
                  },
            email: values.email.trim() || null,
            phone: values.phone.trim() || null,
            population: values.population as RegisterPatient['population'],
            responsibleMemberId: values.responsibleMemberId || undefined,
          });
        }),
      )}
    >
      <Notice tone="info" title="Solo los datos para crear la ficha">
        Los datos de salud se registran después de su consentimiento.
      </Notice>
      <FormError
        error={register.error}
        title={`No se pudo registrar al ${patientLabel.toLowerCase()}`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombres"
          autoComplete="off"
          error={errors.firstName?.message}
          {...form.register('firstName', required('Escribe los nombres.'))}
        />
        <TextField
          label="Apellidos"
          autoComplete="off"
          error={errors.lastName?.message}
          {...form.register('lastName', required('Escribe los apellidos.'))}
        />
        <Controller
          control={form.control}
          name="sex"
          rules={required('Elige el sexo.')}
          render={({ field }) => (
            <Select
              label="Sexo"
              value={field.value || undefined}
              onValueChange={field.onChange}
              error={errors.sex?.message}
              options={(['M', 'F'] as const).map((value) => ({ value, label: SEX_LABELS[value] }))}
            />
          )}
        />
        <TextField
          label="Fecha de nacimiento"
          type="date"
          max={todayIn(timezone)}
          error={errors.birthDate?.message}
          {...form.register('birthDate', required('Indica la fecha de nacimiento.'))}
        />
        <Controller
          control={form.control}
          name="documentType"
          render={({ field }) => (
            <Select
              label="Documento"
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: NO_DOCUMENT, label: 'Sin documento' },
                ...DOCUMENT_TYPES.map((value) => ({ value, label: DOCUMENT_TYPE_LABELS[value] })),
              ]}
            />
          )}
        />
        {documentType === NO_DOCUMENT ? null : (
          <TextField
            label="Número de documento"
            autoComplete="off"
            inputMode={documentType === 'DNI' ? 'numeric' : 'text'}
            hint="Se guarda cifrado; en la ficha solo se ven los 4 últimos dígitos."
            error={errors.documentNumber?.message}
            {...form.register('documentNumber', required('Escribe el número de documento.'))}
          />
        )}
        <TextField
          label="Correo"
          type="email"
          autoComplete="off"
          inputMode="email"
          hint="Para invitarlo a la app."
          {...form.register('email')}
        />
        <TextField label="Teléfono" type="tel" autoComplete="off" {...form.register('phone')} />
        <Controller
          control={form.control}
          name="population"
          render={({ field }) => (
            <Select
              label="Población"
              value={field.value}
              onValueChange={field.onChange}
              hint="«Obesidad» se registra después del consentimiento de datos de salud."
              options={POPULATIONS.filter((value) => value !== 'OBESITY').map((value) => ({
                value,
                label: POPULATION_LABELS[value],
              }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="responsibleMemberId"
          render={({ field }) => (
            <Select
              label="Responsable"
              value={field.value || undefined}
              onValueChange={field.onChange}
              options={active.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          )}
        />
      </div>
      <div>
        <Button type="submit" disabled={!canWrite || register.isPending}>
          {register.isPending ? 'Registrando…' : `Registrar ${patientLabel.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
