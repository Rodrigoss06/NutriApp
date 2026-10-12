'use client';

import {
  DOCUMENT_TYPES,
  POPULATIONS,
  type MemberResponse,
  type PatientResponse,
  type UpdatePatient,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate, todayIn } from '@/lib/dates';
import { DOCUMENT_TYPE_LABELS, maskedDocument, POPULATION_LABELS, SEX_LABELS } from './labels';

const KEEP = 'KEEP';

interface DetailsValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly sex: string;
  readonly birthDate: string;
  readonly email: string;
  readonly population: string;
  readonly responsibleMemberId: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly phone: string;
}

/**
 * Datos de la ficha (RF-08). Es una tarea administrativa: la edita el equipo con WRITE y también OWNER, salvo poner o
 * quitar la población «obesidad», que es dato de salud (ADR-041). El documento y el teléfono no viajan en claro: se
 * escriben de nuevo para cambiarlos. Bloqueo optimista con If-Match.
 */
export function PatientDetails({
  patient,
  members,
}: {
  patient: PatientResponse;
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const { patientLabel, role } = usePanelSession();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState(false);
  const responsible = members.find((m) => m.id === patient.responsibleMemberId);
  const archived = patient.status === 'ARCHIVED';
  const status = useMutation({
    mutationFn: (action: 'archive' | 'reactivate') =>
      apiFetch(`/patients/${patient.id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <FormError error={status.error} />
      {editing ? (
        <DetailsForm
          patient={patient}
          members={members}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail term="Sexo">{SEX_LABELS[patient.sex]}</Detail>
            <Detail term="Fecha de nacimiento">{formatDate(patient.birthDate)}</Detail>
            <Detail term="Documento">{maskedDocument(patient) ?? 'Sin documento'}</Detail>
            <Detail term="Correo">{patient.email ?? 'Sin correo'}</Detail>
            <Detail term="Teléfono">{patient.hasPhone ? 'Registrado' : 'Sin teléfono'}</Detail>
            <Detail term="Población">{POPULATION_LABELS[patient.population]}</Detail>
            <Detail term="Responsable">
              {responsible?.displayName ?? 'Miembro de la organización'}
            </Detail>
            <Detail term="Zona horaria">{patient.timezone}</Detail>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!canWrite || archived}
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar datos
            </Button>
            {archived ? (
              <ConfirmDialog
                trigger={
                  <Button variant="secondary" disabled={!canWrite || status.isPending}>
                    Reactivar
                  </Button>
                }
                title={`¿Reactivar al ${patientLabel.toLowerCase()}?`}
                description="Vuelve a contar en el cupo de pacientes activos del plan."
                confirmLabel="Reactivar"
                onConfirm={() => {
                  status.mutate('reactivate');
                }}
              />
            ) : (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" disabled={!canWrite || status.isPending}>
                    Archivar
                  </Button>
                }
                title={`¿Archivar al ${patientLabel.toLowerCase()}?`}
                description="Su expediente queda en solo lectura, libera cupo y se cierran sus sesiones en la app."
                confirmLabel="Archivar"
                tone="danger"
                onConfirm={() => {
                  status.mutate('archive');
                }}
              />
            )}
            {role === 'OWNER' ? (
              <Link
                href={`/panel/auditoria?paciente=${patient.id}`}
                className="inline-flex h-10 items-center px-4 text-sm font-medium text-brand-text underline"
              >
                Ver su auditoría
              </Link>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function DetailsForm({
  patient,
  members,
  onDone,
  onCancel,
}: {
  patient: PatientResponse;
  members: readonly MemberResponse[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { timezone } = usePanelSession();
  const [nothing, setNothing] = useState(false);
  const form = useForm<DetailsValues>({
    defaultValues: {
      firstName: patient.firstName,
      lastName: patient.lastName,
      sex: patient.sex,
      birthDate: patient.birthDate,
      email: patient.email ?? '',
      population: patient.population,
      responsibleMemberId: patient.responsibleMemberId,
      documentType: KEEP,
      documentNumber: '',
      phone: '',
    },
  });
  const save = useMutation({
    mutationFn: (body: UpdatePatient) =>
      apiFetch(`/patients/${patient.id}`, {
        method: 'PATCH',
        body,
        headers: { 'If-Match': `"${String(patient.version)}"` },
      }),
    onSuccess: onDone,
  });
  const { errors } = form.formState;
  const documentType = useWatch({ control: form.control, name: 'documentType' });
  const active = members.filter((m) => m.status === 'ACTIVE');

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          const change: Record<string, unknown> = {};
          if (values.firstName !== patient.firstName) change['firstName'] = values.firstName;
          if (values.lastName !== patient.lastName) change['lastName'] = values.lastName;
          if (values.sex !== patient.sex) change['sex'] = values.sex;
          if (values.birthDate !== patient.birthDate) change['birthDate'] = values.birthDate;
          if (values.email.trim() !== (patient.email ?? ''))
            change['email'] = values.email.trim() || null;
          if (values.population !== patient.population) change['population'] = values.population;
          if (values.responsibleMemberId !== patient.responsibleMemberId)
            change['responsibleMemberId'] = values.responsibleMemberId;
          if (values.documentType === 'NONE') change['document'] = null;
          else if (values.documentType !== KEEP)
            change['document'] = { type: values.documentType, number: values.documentNumber };
          if (values.phone.trim()) change['phone'] = values.phone.trim();
          if (Object.keys(change).length === 0) {
            setNothing(true);
            return;
          }
          setNothing(false);
          save.mutate(change);
        }),
      )}
    >
      <FormError error={save.error} title="No se guardaron los cambios" />
      {nothing ? <Notice tone="info" title="No hay cambios que guardar" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombres"
          error={errors.firstName?.message}
          {...form.register('firstName', { required: 'Escribe los nombres.' })}
        />
        <TextField
          label="Apellidos"
          error={errors.lastName?.message}
          {...form.register('lastName', { required: 'Escribe los apellidos.' })}
        />
        <Controller
          control={form.control}
          name="sex"
          render={({ field }) => (
            <Select
              label="Sexo"
              value={field.value}
              onValueChange={field.onChange}
              options={(['M', 'F'] as const).map((value) => ({ value, label: SEX_LABELS[value] }))}
            />
          )}
        />
        <TextField
          label="Fecha de nacimiento"
          type="date"
          max={todayIn(timezone)}
          {...form.register('birthDate', { required: 'Indica la fecha de nacimiento.' })}
        />
        <TextField label="Correo" type="email" inputMode="email" {...form.register('email')} />
        <Controller
          control={form.control}
          name="population"
          render={({ field }) => (
            <Select
              label="Población"
              value={field.value}
              onValueChange={field.onChange}
              hint="«Obesidad» es un dato de salud: necesita el consentimiento y la registra el equipo de atención."
              options={POPULATIONS.map((value) => ({ value, label: POPULATION_LABELS[value] }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="responsibleMemberId"
          render={({ field }) => (
            <Select
              label="Responsable"
              value={field.value}
              onValueChange={field.onChange}
              options={active.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          )}
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
                { value: KEEP, label: 'Sin cambios' },
                { value: 'NONE', label: 'Quitar el documento' },
                ...DOCUMENT_TYPES.map((value) => ({ value, label: DOCUMENT_TYPE_LABELS[value] })),
              ]}
            />
          )}
        />
        {documentType === KEEP || documentType === 'NONE' ? null : (
          <TextField
            label="Número de documento"
            autoComplete="off"
            error={errors.documentNumber?.message}
            {...form.register('documentNumber', { required: 'Escribe el número completo.' })}
          />
        )}
        <TextField
          label="Teléfono nuevo"
          type="tel"
          autoComplete="off"
          hint="Déjalo vacío para no cambiarlo."
          {...form.register('phone')}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
