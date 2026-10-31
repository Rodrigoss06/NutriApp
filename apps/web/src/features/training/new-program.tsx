'use client';

import {
  ONE_RM_FORMULA_LABELS,
  ONE_RM_FORMULAS,
  PRESCRIPTION_STATUS_LABELS,
  type CareTeamMember,
  type CreateProgram,
  type MemberResponse,
  type OneRmFormula,
  type TrainingSafetyResponse,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { CareTeamNotice } from '@/features/patients/record-write-gate';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { apiFetch } from '@/lib/api/client';
import { PRESCRIPTION_STATUS_MESSAGES } from './labels';
import { useEditsRecord } from './use-edits-record';

interface ManualValues {
  readonly name: string;
  readonly startDate: string;
  readonly oneRmFormula: string;
}

/**
 * Crear un programa: la propuesta sale del perfil y no se genera con una llave cerrada (RN-F15); a mano se permite, con un aviso
 * (ADR-070). La fórmula de 1RM se elige en el primer programa: después es siempre la misma (RN-F04).
 */
export function NewProgram({
  patientId,
  safety,
  fixedFormula,
  careTeam,
  members,
  archived,
  base,
}: {
  patientId: string;
  safety: TrainingSafetyResponse;
  /** La que ya tiene, si tiene un programa. */
  fixedFormula: OneRmFormula | null;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
  base: string;
}) {
  const router = useRouter();
  const editable = useEditsRecord(careTeam, members, archived);
  const writes = useWritesRecord(careTeam, members);
  const [manualOpen, setManualOpen] = useState(false);
  const form = useForm<ManualValues>({
    defaultValues: { name: '', startDate: '', oneRmFormula: fixedFormula ?? 'ONERM_EPLEY1985' },
  });
  const open = ({ id }: { id: string }) => {
    router.push(`${base}/${id}`);
  };
  const propose = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/patients/${patientId}/training-programs/proposal`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: open,
  });
  const create = useMutation({
    mutationFn: (body: CreateProgram) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/training-programs`, {
        method: 'POST',
        body,
      }),
    onSuccess: open,
  });
  if (!writes) return <CareTeamNotice patientId={patientId} action="crear un programa" />;
  if (!editable) return null;

  return (
    <div className="flex flex-col gap-4">
      {safety.blocked ? (
        <Notice tone="danger" title={PRESCRIPTION_STATUS_LABELS[safety.status]} rule="RN-F15">
          {PRESCRIPTION_STATUS_MESSAGES[safety.status]} Mientras tanto no hay propuesta.{' '}
          <Link
            href={`/panel/pacientes/${patientId}/entrenamiento`}
            className="underline underline-offset-4"
          >
            Ver las llaves
          </Link>
        </Notice>
      ) : null}
      <FormError error={propose.error} title="No se generó la propuesta" />
      <div className="flex flex-wrap gap-3">
        {safety.blocked ? null : (
          <Button
            disabled={propose.isPending}
            onClick={() => {
              propose.mutate();
            }}
          >
            {propose.isPending ? 'Generando…' : 'Generar propuesta'}
          </Button>
        )}
        <Button
          variant="secondary"
          aria-expanded={manualOpen}
          onClick={() => {
            setManualOpen((current) => !current);
          }}
        >
          Programa a mano
        </Button>
      </div>
      {manualOpen ? (
        <form
          noValidate
          aria-label="Nuevo programa a mano"
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          onSubmit={submitWith(
            form.handleSubmit((values) => {
              create.mutate({
                name: values.name,
                startDate: values.startDate || null,
                oneRmFormula: fixedFormula ? null : (values.oneRmFormula as OneRmFormula),
              });
            }),
          )}
        >
          {safety.blocked ? (
            <Notice tone="warning" title="Una llave de seguridad sigue cerrada" rule="RN-F15">
              A mano se puede armar y publicar, y queda registrado.
            </Notice>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nombre"
              maxLength={120}
              error={form.formState.errors.name?.message}
              {...form.register('name', {
                validate: (value) => value.trim() !== '' || 'Escribe el nombre del programa.',
              })}
            />
            <TextField
              label="Fecha de inicio"
              type="date"
              hint="Si queda vacía, empieza el día que se publique."
              {...form.register('startDate')}
            />
            {fixedFormula ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Fórmula de 1RM: {ONE_RM_FORMULA_LABELS[fixedFormula]}. Es siempre la misma para esta
                persona (RN-F04).
              </p>
            ) : (
              <Controller
                control={form.control}
                name="oneRmFormula"
                render={({ field }) => (
                  <Select
                    label="Fórmula de 1RM"
                    hint="Es siempre la misma para esta persona (RN-F04)."
                    value={field.value}
                    onValueChange={field.onChange}
                    options={ONE_RM_FORMULAS.map((code) => ({
                      value: code,
                      label: ONE_RM_FORMULA_LABELS[code],
                    }))}
                  />
                )}
              />
            )}
          </div>
          <FormError error={create.error} title="No se creó el programa" />
          <div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear programa'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
