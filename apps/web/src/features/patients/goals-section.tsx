'use client';

import { GOAL_KINDS, type CreateGoal, type Goal } from '@nutricoach/contracts';
import { Button, formatNumber, parseDecimal, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';
import { GOAL_KIND_LABELS, GOAL_STATUS_LABELS, optionsOf } from './labels';

interface GoalValues {
  readonly kind: string;
  readonly metricCode: string;
  readonly targetValue: string;
  readonly targetDate: string;
  readonly notes: string;
}

/** Objetivos del paciente (RF-09): filas propias; cambian solo el estado y las notas. */
export function GoalsSection({
  patientId,
  goals,
  archived,
}: {
  patientId: string;
  goals: readonly Goal[];
  archived: boolean;
}) {
  const router = useRouter();
  const canWrite = useCanWrite() && !archived;
  const form = useForm<GoalValues>({
    defaultValues: { kind: 'HEALTH', metricCode: '', targetValue: '', targetDate: '', notes: '' },
  });
  const add = useMutation({
    mutationFn: (body: CreateGoal) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/goals`, { method: 'POST', body }),
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const change = useMutation({
    mutationFn: (input: { id: string; status: Goal['status'] }) =>
      apiFetch(`/patients/${patientId}/goals/${input.id}`, {
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
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin objetivos registrados.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {goals.map((goal) => (
            <li key={goal.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{GOAL_KIND_LABELS[goal.kind]}</span>
                  <StatusBadge tone={goal.status === 'ACHIEVED' ? 'success' : 'info'}>
                    {GOAL_STATUS_LABELS[goal.status]}
                  </StatusBadge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {[
                    goal.metricCode && goal.targetValue !== null
                      ? `${goal.metricCode}: ${formatNumber(goal.targetValue, 'index')}`
                      : goal.metricCode,
                    goal.targetDate ? `para el ${formatDate(goal.targetDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sin meta numérica'}
                </span>
                {goal.notes ? <p className="text-sm whitespace-pre-wrap">{goal.notes}</p> : null}
              </div>
              <Select
                label="Estado"
                value={goal.status}
                disabled={!canWrite || change.isPending}
                onValueChange={(value) => {
                  change.mutate({ id: goal.id, status: value as Goal['status'] });
                }}
                options={optionsOf(GOAL_STATUS_LABELS)}
                className="sm:w-44"
              />
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        aria-label="Registrar un objetivo"
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            add.mutate({
              kind: values.kind as CreateGoal['kind'],
              metricCode: values.metricCode.trim().toUpperCase() || null,
              targetValue: values.targetValue ? parseDecimal(values.targetValue) : null,
              targetDate: values.targetDate || null,
              notes: values.notes || null,
            });
          }),
        )}
      >
        <h3 className="font-semibold">Registrar objetivo</h3>
        <FormError error={add.error} title="No se registró el objetivo" />
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
                options={GOAL_KINDS.map((value) => ({ value, label: GOAL_KIND_LABELS[value] }))}
              />
            )}
          />
          <TextField
            label="Indicador"
            placeholder="WEIGHT_KG"
            hint="Opcional. Letras, números y guion bajo."
            disabled={!canWrite}
            {...form.register('metricCode')}
          />
          <TextField
            label="Meta"
            inputMode="decimal"
            disabled={!canWrite}
            error={form.formState.errors.targetValue?.message}
            {...form.register('targetValue', {
              validate: (value) => !value || parseDecimal(value) !== null || 'Escribe un número.',
            })}
          />
          <TextField
            label="Para el"
            type="date"
            disabled={!canWrite}
            {...form.register('targetDate')}
          />
        </div>
        <TextAreaField
          label="Notas"
          maxLength={2000}
          disabled={!canWrite}
          {...form.register('notes')}
        />
        <div>
          <Button type="submit" disabled={!canWrite || add.isPending}>
            Registrar objetivo
          </Button>
        </div>
      </form>
    </div>
  );
}
