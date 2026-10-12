'use client';

import type { ClinicalNote, CreateClinicalNote, MemberResponse } from '@nutricoach/contracts';
import { Button, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { NOTE_VISIBILITY_LABELS, optionsOf } from './labels';

interface NoteValues {
  readonly body: string;
  readonly visibility: string;
}

/**
 * Notas clínicas (RF-09): no se editan; se enmiendan con otra nota que cita la anterior. «Solo yo» (AUTHOR_ONLY) la ve
 * solo su autor, también frente al dueño de la organización.
 */
export function NotesSection({
  patientId,
  notes,
  members,
  archived,
}: {
  patientId: string;
  notes: readonly ClinicalNote[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite() && !archived;
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const [amending, setAmending] = useState<ClinicalNote | null>(null);
  const form = useForm<NoteValues>({ defaultValues: { body: '', visibility: 'CARE_TEAM' } });
  const add = useMutation({
    mutationFn: (body: CreateClinicalNote) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/notes`, { method: 'POST', body }),
    onSuccess: () => {
      form.reset();
      setAmending(null);
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin notas.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {[...notes].reverse().map((note) => {
            const amended = note.amendsNoteId ? byId.get(note.amendsNoteId) : undefined;
            return (
              <li key={note.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatInstant(note.createdAt, timezone)}</span>
                  <span>· {names.get(note.authorMemberId) ?? 'Miembro de la organización'}</span>
                  <StatusBadge tone={note.visibility === 'AUTHOR_ONLY' ? 'warning' : 'info'}>
                    {NOTE_VISIBILITY_LABELS[note.visibility]}
                  </StatusBadge>
                </div>
                {note.amendsNoteId ? (
                  <p className="text-sm text-muted-foreground">
                    Enmienda a la nota del{' '}
                    {amended ? formatInstant(amended.createdAt, timezone) : 'que no puedes ver'}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">{note.body}</p>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canWrite}
                    onClick={() => {
                      setAmending(note);
                    }}
                  >
                    Enmendar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        noValidate
        aria-label="Escribir una nota"
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            add.mutate({
              body: values.body,
              visibility: values.visibility as CreateClinicalNote['visibility'],
              amendsNoteId: amending?.id ?? null,
            });
          }),
        )}
      >
        <h3 className="font-semibold">{amending ? 'Enmendar nota' : 'Escribir nota'}</h3>
        {amending ? (
          <Notice
            tone="info"
            title={`Enmienda a la nota del ${formatInstant(amending.createdAt, timezone)}`}
          >
            <span className="flex flex-col gap-2">
              La nota original no cambia: la enmienda queda como una nota nueva que la cita.
              <span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAmending(null);
                  }}
                >
                  Cancelar la enmienda
                </Button>
              </span>
            </span>
          </Notice>
        ) : null}
        <FormError error={add.error} title="No se guardó la nota" />
        <TextAreaField
          label="Nota"
          maxLength={10000}
          disabled={!canWrite}
          error={form.formState.errors.body?.message}
          {...form.register('body', { required: 'Escribe la nota.' })}
        />
        <Controller
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <Select
              label="Quién la ve"
              value={field.value}
              disabled={!canWrite}
              onValueChange={field.onChange}
              options={optionsOf(NOTE_VISIBILITY_LABELS)}
              hint="«Solo yo»: ni el dueño de la organización la ve."
              className="sm:w-64"
            />
          )}
        />
        <div>
          <Button type="submit" disabled={!canWrite || add.isPending}>
            Guardar nota
          </Button>
        </div>
      </form>
    </div>
  );
}
