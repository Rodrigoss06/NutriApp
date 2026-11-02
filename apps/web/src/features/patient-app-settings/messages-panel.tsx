'use client';

import type {
  CareTeamMember,
  CreateMotivationalMessage,
  MemberResponse,
  MotivationalMessage,
  MotivationalMessagesResponse,
} from '@nutricoach/contracts';
import { Button, Notice, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';

/** Hoy en la zona horaria de la organización, como YYYY-MM-DD. */
const todayIn = (timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function stateOf(message: MotivationalMessage, today: string) {
  if (message.activeTo !== null && message.activeTo < today)
    return { tone: 'info', label: 'Terminado' } as const;
  if (message.activeFrom !== null && message.activeFrom > today) {
    return { tone: 'info', label: 'Programado' } as const;
  }
  return { tone: 'success', label: 'Vigente' } as const;
}

/**
 * Mensajes motivacionales (RF-27): los de un paciente o los de todos, según la ruta. Nada se borra: un mensaje se termina y queda
 * en la lista con su fecha de fin.
 */
export function MessagesPanel({
  basePath,
  canWrite,
  emptyText,
}: {
  /** /patients/:id/motivational-messages o /motivational-messages. */
  basePath: string;
  canWrite: boolean;
  emptyText: string;
}) {
  const { timezone } = usePanelSession();
  const today = todayIn(timezone);
  const client = useQueryClient();
  const key = ['motivational-messages', basePath];
  const list = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<MotivationalMessagesResponse>(basePath),
  });
  const [body, setBody] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const create = useMutation({
    mutationFn: (input: CreateMotivationalMessage) =>
      apiFetch<MotivationalMessage>(basePath, { method: 'POST', body: input }),
    onSuccess: async () => {
      setBody('');
      setActiveFrom('');
      setActiveTo('');
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const end = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MotivationalMessage>(`${basePath}/${id}`, {
        method: 'PATCH',
        body: { activeTo: today },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const messages = list.data?.messages ?? [];
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <FormError error={list.error ?? end.error} title="No pudimos cargar o cambiar los mensajes" />
      {messages.length === 0 && list.isSuccess ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {messages.map((message) => {
          const state = stateOf(message, today);
          return (
            <li key={message.id} className="flex flex-col gap-2 p-3">
              <p>{message.body}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                {message.activeFrom ? <span>desde el {formatDate(message.activeFrom)}</span> : null}
                {message.activeTo ? <span>hasta el {formatDate(message.activeTo)}</span> : null}
                {canWrite && state.label !== 'Terminado' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={end.isPending}
                    onClick={() => {
                      end.mutate(message.id);
                    }}
                  >
                    Terminar hoy
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            create.mutate({
              body: body.trim(),
              activeFrom: activeFrom || null,
              activeTo: activeTo || null,
            });
          }}
        >
          {create.isSuccess ? <Notice tone="success" title="Mensaje agregado" /> : null}
          <TextAreaField
            label="Mensaje nuevo"
            hint="Hasta 280 caracteres. Sin fechas, vale desde hoy y hasta que lo termines."
            maxLength={280}
            rows={2}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Desde"
              type="date"
              value={activeFrom}
              onChange={(event) => {
                setActiveFrom(event.target.value);
              }}
            />
            <TextField
              label="Hasta"
              type="date"
              value={activeTo}
              onChange={(event) => {
                setActiveTo(event.target.value);
              }}
            />
          </div>
          <FormError error={create.error} title="No se agregó el mensaje" />
          <Button type="submit" className="self-start" disabled={create.isPending || !body.trim()}>
            Agregar mensaje
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** Los mensajes de un paciente: los escribe su equipo de atención con acceso de escritura (RN-A05). */
export function PatientMessages({
  patientId,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const writesRecord = useWritesRecord(careTeam, members);
  const canWrite = useCanWrite();
  return (
    <MessagesPanel
      basePath={`/patients/${patientId}/motivational-messages`}
      canWrite={writesRecord && canWrite && !archived}
      emptyText="Todavía no tiene mensajes propios: ve los de todos los pacientes, si hay."
    />
  );
}
