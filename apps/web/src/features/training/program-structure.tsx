'use client';

import type { AddMesocycle, ProgramDocument } from '@nutricoach/contracts';
import { Button, ConfirmDialog } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxField, submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { weekRange, weeksOfDocument, type ProgramWeek } from './program-draft';
import type { ProgramEditor as Editor } from './use-program';

const WEEK_LIST = new Intl.ListFormat('es', { type: 'conjunction' });
/** «la semana 2» o «las semanas 2, 3 y 4». */
const weeksPhrase = (weeks: readonly ProgramWeek[]): string =>
  `${weeks.length === 1 ? 'la semana' : 'las semanas'} ${WEEK_LIST.format(
    weeks.map((week) => String(week.weekNo)),
  )}`;
const sessionsText = (count: number): string =>
  count === 1 ? '1 sesión' : `${String(count)} sesiones`;

interface MesocycleValues {
  readonly name: string;
  readonly focus: string;
  readonly weeks: string;
}

const emptyMesocycle = (position: number): MesocycleValues => ({
  name: `Mesociclo ${String(position)}`,
  focus: '',
  weeks: '4',
});

/** Los mesociclos de un programa a mano: sus semanas siguen a las anteriores (02 §7). Los de una propuesta salen del macrociclo. */
export function MesocycleManager({
  document,
  locked,
  write,
}: {
  document: ProgramDocument;
  locked: boolean;
  write: Editor['write'];
}) {
  const { mesocycles } = document;
  const form = useForm<MesocycleValues>({
    defaultValues: emptyMesocycle(mesocycles.length + 1),
  });
  const add = useMutation({
    mutationFn: (body: AddMesocycle) => write('/mesocycles', { method: 'POST', body }),
    onSuccess: () => {
      form.reset(emptyMesocycle(mesocycles.length + 2));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => write(`/mesocycles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (!form.formState.isDirty) form.reset(emptyMesocycle(mesocycles.length));
    },
  });
  return (
    <section
      aria-labelledby="mesociclos-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="mesociclos-titulo" className="font-semibold">
        Mesociclos
      </h3>
      {mesocycles.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {mesocycles.map((mesocycle) => (
            <li
              key={mesocycle.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{mesocycle.name}</span>
                {mesocycle.focus ? ` · ${mesocycle.focus}` : ''} · {weekRange(mesocycle.weeks)}
              </span>
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" disabled={locked || remove.isPending}>
                    Quitar
                  </Button>
                }
                title={`¿Quitar ${mesocycle.name}?`}
                description="Se borran sus semanas con sus sesiones, y las semanas siguientes se vuelven a numerar."
                confirmLabel="Quitar mesociclo"
                tone="danger"
                onConfirm={() => {
                  remove.mutate(mesocycle.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <FormError error={remove.error} title="No se quitó el mesociclo" />
      <form
        noValidate
        aria-label="Agregar un mesociclo"
        className="flex flex-col gap-3"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            add.mutate({
              name: values.name,
              focus: values.focus,
              weeks: Number(values.weeks),
            });
          }),
        )}
      >
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
          <TextField
            label="Nombre del mesociclo"
            maxLength={120}
            autoComplete="off"
            error={form.formState.errors.name?.message}
            {...form.register('name', {
              validate: (value) => value.trim() !== '' || 'Escribe el nombre del mesociclo.',
            })}
          />
          <TextField
            label="Enfoque"
            maxLength={300}
            autoComplete="off"
            {...form.register('focus')}
          />
          <TextField
            label="Semanas"
            inputMode="numeric"
            autoComplete="off"
            error={form.formState.errors.weeks?.message}
            {...form.register('weeks', {
              validate: (value) => /^([1-9]|1[0-2])$/.test(value.trim()) || 'De 1 a 12.',
            })}
          />
        </div>
        <FormError error={add.error} title="No se agregó el mesociclo" />
        <div>
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {add.isPending ? 'Agregando…' : 'Agregar mesociclo'}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Elegir la semana, por mesociclo. Con cambios sin guardar no se cambia de semana: se perderían. */
export function WeekNav({
  document,
  selectedId,
  locked,
  onSelect,
}: {
  document: ProgramDocument;
  selectedId: string | undefined;
  locked: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Semanas del programa" className="flex flex-col gap-3">
      {document.mesocycles.map((mesocycle) => (
        <div key={mesocycle.id} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">
            {mesocycle.name}
            {mesocycle.focus ? ` · ${mesocycle.focus}` : ''}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {mesocycle.weeks.map((week) => {
              const selected = week.id === selectedId;
              return (
                <li key={week.id}>
                  <Button
                    size="sm"
                    variant={selected ? 'primary' : 'secondary'}
                    aria-current={selected ? 'true' : undefined}
                    disabled={locked && !selected}
                    onClick={() => {
                      if (!selected) onSelect(week.id);
                    }}
                  >
                    Semana {week.weekNo}
                    {week.isDeload ? ' · Descarga' : ''}
                    {week.sessions.length === 0 ? ' · vacía' : ''}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {locked ? (
        <p className="text-sm text-muted-foreground">
          Guarda o descarta los cambios de esta semana para ir a otra.
        </p>
      ) : null}
    </nav>
  );
}

/**
 * Duplicar la semana (RF-26): copia sus sesiones a otras y reemplaza lo que tuvieran; la fase de cada una no cambia. Por defecto se marcan las
 * vacías, para que lo habitual no pise nada.
 */
export function DuplicateWeek({
  week,
  document,
  locked,
  write,
}: {
  week: ProgramWeek;
  document: ProgramDocument;
  locked: boolean;
  write: Editor['write'];
}) {
  const others = weeksOfDocument(document).filter((other) => other.id !== week.id);
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const [copiedTo, setCopiedTo] = useState<string | null>(null);
  const current =
    picked ?? new Set(others.filter((other) => other.sessions.length === 0).map(({ id }) => id));
  const targets = others.filter((other) => current.has(other.id));
  const replaced = targets.filter((other) => other.sessions.length > 0);
  const duplicate = useMutation({
    mutationFn: (weeks: readonly ProgramWeek[]) =>
      write(`/weeks/${week.id}/duplicate`, {
        method: 'POST',
        body: { targetWeekIds: weeks.map(({ id }) => id) },
      }),
    onSuccess: (_, weeks) => {
      setPicked(null);
      setCopiedTo(weeksPhrase(weeks));
    },
  });
  if (others.length === 0) return null;
  const disabled = locked || targets.length === 0 || duplicate.isPending;
  const label =
    targets.length === 1 ? 'Duplicar en 1 semana' : `Duplicar en ${String(targets.length)} semanas`;
  return (
    <section
      aria-labelledby="duplicar-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="duplicar-titulo" className="font-semibold">
        Duplicar esta semana
      </h3>
      {week.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Guarda al menos una sesión para poder duplicarla.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Copia sus sesiones a las semanas que marques y reemplaza lo que tengan. La fase de cada
            semana no cambia.
          </p>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((other) => (
              <CheckboxField
                key={other.id}
                label={`Semana ${String(other.weekNo)}${
                  other.sessions.length > 0 ? ` (tiene ${sessionsText(other.sessions.length)})` : ''
                }`}
                checked={current.has(other.id)}
                onChange={(event) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(other.id);
                  else next.delete(other.id);
                  setPicked(next);
                  setCopiedTo(null);
                }}
              />
            ))}
          </div>
          <FormError error={duplicate.error} title="No se duplicó la semana" />
          {locked ? (
            <p className="text-sm text-muted-foreground">Guarda los cambios antes de duplicar.</p>
          ) : null}
          <div>
            {replaced.length > 0 ? (
              <ConfirmDialog
                trigger={
                  <Button variant="secondary" disabled={disabled}>
                    {label}
                  </Button>
                }
                title={`¿Reemplazar las sesiones de ${weeksPhrase(replaced)}?`}
                description="Lo que tienen ahora se pierde. Su fase no cambia."
                confirmLabel="Reemplazar y duplicar"
                tone="danger"
                onConfirm={() => {
                  duplicate.mutate(targets);
                }}
              />
            ) : (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  duplicate.mutate(targets);
                }}
              >
                {duplicate.isPending ? 'Duplicando…' : label}
              </Button>
            )}
          </div>
          {copiedTo ? (
            <p role="status" className="text-sm">
              Copiada a {copiedTo}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
