'use client';

import type { PlanListResponse } from '@nutricoach/contracts';
import { Button, Notice, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { createPlan, fromCents, toCents, updatePlan } from './platform-api';

type Plan = PlanListResponse['plans'][number];

interface Draft {
  code: string;
  name: string;
  maxActivePatients: string;
  maxProfessionals: string;
  durationMonths: string;
  price: string;
}

const draftOf = (plan: Plan | null): Draft => ({
  code: plan?.code ?? '',
  name: plan?.name ?? '',
  maxActivePatients: String(plan?.maxActivePatients ?? 5),
  maxProfessionals: String(plan?.maxProfessionals ?? 1),
  durationMonths: String(plan?.durationMonths ?? 12),
  price: plan ? fromCents(plan.priceCents) : '0.00',
});

const valuesOf = (draft: Draft) => ({
  name: draft.name,
  maxActivePatients: Number(draft.maxActivePatients),
  maxProfessionals: Number(draft.maxProfessionals),
  durationMonths: Number(draft.durationMonths),
  priceCents: toCents(draft.price),
});

/** Los campos de un plan; el código solo al crearlo, porque no cambia. */
function PlanFields({
  draft,
  onChange,
  withCode,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  withCode: boolean;
}) {
  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => {
      onChange({ ...draft, [key]: event.target.value });
    },
  });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {withCode ? (
        <TextField
          label="Código"
          hint="Como TRAMO_50; no cambia."
          autoComplete="off"
          {...field('code')}
        />
      ) : null}
      <TextField label="Nombre" autoComplete="off" {...field('name')} />
      <TextField
        label="Pacientes activos"
        type="number"
        inputMode="numeric"
        min={1}
        {...field('maxActivePatients')}
      />
      <TextField
        label="Profesionales"
        type="number"
        inputMode="numeric"
        min={1}
        {...field('maxProfessionals')}
      />
      <TextField
        label="Meses de vigencia"
        type="number"
        inputMode="numeric"
        min={1}
        max={60}
        {...field('durationMonths')}
      />
      <TextField label="Precio (S/)" inputMode="decimal" {...field('price')} />
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftOf(plan));
  const save = useMutation({
    mutationFn: (input: Parameters<typeof updatePlan>[1]) => updatePlan(plan.code, input),
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">{plan.name}</span>{' '}
          <span className="text-sm text-muted-foreground">{plan.code}</span>
        </p>
        <StatusBadge tone={plan.isActive ? 'success' : 'warning'}>
          {plan.isActive ? 'Activo' : 'Desactivado'}
        </StatusBadge>
      </div>
      <p className="text-sm tabular-nums">
        {plan.maxActivePatients} pacientes · {plan.maxProfessionals} profesionales ·{' '}
        {plan.durationMonths} meses · S/ {fromCents(plan.priceCents)}
      </p>
      {editing ? (
        <form
          aria-label={`Editar ${plan.name}`}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(valuesOf(draft));
          }}
        >
          <PlanFields draft={draft} onChange={setDraft} withCode={false} />
          <FormError error={save.error} title="No se guardó el plan" />
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              Guardar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(true);
            }}
          >
            Editar<span className="sr-only"> {plan.name}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              save.mutate({ isActive: !plan.isActive });
            }}
          >
            {plan.isActive ? 'Desactivar' : 'Activar'}
            <span className="sr-only"> {plan.name}</span>
          </Button>
          <FormError error={save.error} title="No se guardó el plan" />
        </div>
      )}
    </li>
  );
}

/** Los planes con su edición y el alta de uno nuevo (N9). */
export function PlanEditor({ plans }: { plans: readonly Plan[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftOf(null));
  const create = useMutation({
    mutationFn: () => createPlan({ code: draft.code.trim(), currency: 'PEN', ...valuesOf(draft) }),
    onSuccess: () => {
      setDraft(draftOf(null));
      router.refresh();
    },
  });
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3" aria-label="Planes">
        {plans.map((plan) => (
          <PlanRow key={plan.code} plan={plan} />
        ))}
      </ul>
      <section aria-labelledby="nuevo-plan" className="flex flex-col gap-3">
        <h2 id="nuevo-plan" className="text-lg font-semibold">
          Nuevo plan
        </h2>
        <form
          aria-label="Nuevo plan"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <PlanFields draft={draft} onChange={setDraft} withCode />
          <FormError error={create.error} title="No se creó el plan" />
          {create.isSuccess ? <Notice tone="success" title="Plan creado" /> : null}
          <Button type="submit" className="w-fit" disabled={create.isPending}>
            Crear plan
          </Button>
        </form>
      </section>
    </div>
  );
}
