'use client';

import {
  CONDITION_KINDS,
  type CareTeamMember,
  type Condition,
  type CreateCondition,
  type FoodExclusionListResponse,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { ExcludedFoods } from '@/features/nutrition-plan/excluded-foods';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';
import { CONDITION_KIND_LABELS, CONDITION_STATUS_LABELS } from './labels';
import { useWritesRecord } from './use-writes-record';

interface ConditionValues {
  readonly kind: string;
  readonly label: string;
  readonly codeSystem: string;
  readonly code: string;
  readonly since: string;
  readonly notes: string;
}

/**
 * Condiciones como filas propias (RF-09): enfermedades, alergias, intolerancias, medicamentos, suplementos, cirugías y
 * lesiones. Lo registrado no se reescribe: solo cambian el estado y las notas. Una alergia o intolerancia activa se enlaza
 * además con los alimentos que excluye de la dieta (RN-E17).
 */
export function ConditionsSection({
  patientId,
  conditions,
  exclusions,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  conditions: readonly Condition[];
  exclusions: FoodExclusionListResponse['conditions'];
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const router = useRouter();
  const canWrite = useCanWrite() && !archived;
  const writesRecord = useWritesRecord(careTeam, members);
  const form = useForm<ConditionValues>({
    defaultValues: { kind: 'DISEASE', label: '', codeSystem: '', code: '', since: '', notes: '' },
  });
  const add = useMutation({
    mutationFn: (body: CreateCondition) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/conditions`, { method: 'POST', body }),
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const change = useMutation({
    mutationFn: (input: { id: string; status: Condition['status'] }) =>
      apiFetch(`/patients/${patientId}/conditions/${input.id}`, {
        method: 'PATCH',
        body: { status: input.status },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <FormError error={change.error} />
      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin condiciones registradas.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {conditions.map((condition) => {
            const dietary = exclusions.find((e) => e.conditionId === condition.id);
            return (
              <li key={condition.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {CONDITION_KIND_LABELS[condition.kind]}: {condition.label}
                    </span>
                    <StatusBadge tone={condition.status === 'ACTIVE' ? 'warning' : 'success'}>
                      {CONDITION_STATUS_LABELS[condition.status]}
                    </StatusBadge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {[
                      condition.code
                        ? `${condition.codeSystem ?? 'Código'} ${condition.code}`
                        : null,
                      condition.since ? `desde el ${formatDate(condition.since)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin código ni fecha'}
                  </span>
                  {condition.notes ? (
                    <p className="text-sm whitespace-pre-wrap">{condition.notes}</p>
                  ) : null}
                  {dietary ? (
                    <ExcludedFoods
                      patientId={patientId}
                      condition={dietary}
                      canWrite={canWrite && writesRecord}
                    />
                  ) : null}
                </div>
                {writesRecord ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canWrite || change.isPending}
                    onClick={() => {
                      change.mutate({
                        id: condition.id,
                        status: condition.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE',
                      });
                    }}
                  >
                    {condition.status === 'ACTIVE' ? 'Marcar resuelta' : 'Marcar activa'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {writesRecord ? (
        <form
          noValidate
          aria-label="Registrar una condición"
          className="flex flex-col gap-4 rounded-lg border border-border p-4 bg-card"
          onSubmit={submitWith(
            form.handleSubmit((values) => {
              add.mutate({
                kind: values.kind as CreateCondition['kind'],
                label: values.label,
                codeSystem: values.codeSystem || null,
                code: values.code || null,
                since: values.since || null,
                notes: values.notes || null,
              });
            }),
          )}
        >
          <h3 className="font-semibold">Registrar condición</h3>
          <FormError error={add.error} title="No se registró la condición" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select
                  label="Tipo"
                  value={field.value}
                  disabled={!canWrite}
                  onValueChange={field.onChange}
                  options={CONDITION_KINDS.map((value) => ({
                    value,
                    label: CONDITION_KIND_LABELS[value],
                  }))}
                />
              )}
            />
            <TextField
              label="Descripción"
              disabled={!canWrite}
              error={form.formState.errors.label?.message}
              {...form.register('label', { required: 'Describe la condición.', maxLength: 200 })}
            />
            <TextField
              label="Sistema de códigos"
              placeholder="CIE-10"
              disabled={!canWrite}
              {...form.register('codeSystem')}
            />
            <TextField
              label="Código"
              placeholder="E03.9"
              disabled={!canWrite}
              {...form.register('code')}
            />
            <TextField label="Desde" type="date" disabled={!canWrite} {...form.register('since')} />
          </div>
          <TextAreaField
            label="Notas"
            maxLength={2000}
            disabled={!canWrite}
            {...form.register('notes')}
          />
          <div>
            <Button type="submit" disabled={!canWrite || add.isPending}>
              Registrar condición
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
