'use client';

import type { AppNote } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { usePanelSession } from '@/features/session/panel-session';

/**
 * Las notas del paciente que nadie del equipo había abierto (RN-G13). Se muestran aquí marcadas como nuevas y, al abrirlas, la
 * API las deja leídas por quien mira: la próxima vez ya no aparecen.
 */
export function UnreadNotes({
  patientId,
  notes,
}: {
  patientId: string;
  notes: readonly AppNote[];
}) {
  const { timezone } = usePanelSession();
  const marked = useRef(false);
  const markRead = useMutation({
    mutationFn: (noteIds: readonly string[]) =>
      apiFetch<{ marked: number }>(`/patients/${patientId}/app-notes/read`, {
        method: 'POST',
        body: { noteIds },
      }),
  });
  const { mutate } = markRead;

  useEffect(() => {
    if (marked.current || notes.length === 0) return;
    marked.current = true;
    mutate(notes.map((note) => note.id));
  }, [mutate, notes]);

  if (notes.length === 0) return null;
  return (
    <section aria-labelledby="notas-nuevas" className="flex flex-col gap-2">
      <h2 id="notas-nuevas" className="text-lg font-semibold">
        Notas nuevas del paciente
      </h2>
      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex flex-col gap-1 rounded-lg border border-brand-border bg-card p-3"
          >
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge tone="info">Nueva</StatusBadge>
              {formatInstant(note.createdAt, timezone)}
            </p>
            <p>{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
