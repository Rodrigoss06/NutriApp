'use client';

import type { LogNote, NoteLog } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { newClientId, useRecord } from './records';

/** Una nota para el equipo de atención (RN-G13): la ven como no leída hasta que alguien la abre. */
export function NotesForm({ localDate, editable }: { localDate: string; editable: boolean }) {
  const [body, setBody] = useState('');
  const record = useRecord<LogNote, NoteLog>('/me/notes');
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        record.mutate(
          { clientId: newClientId(), localDate, body: body.trim() },
          {
            onSuccess: () => {
              setBody('');
            },
          },
        );
      }}
    >
      {record.isSuccess ? (
        <Notice tone="success" title="Nota enviada">
          Tu equipo la verá en tu expediente.
        </Notice>
      ) : null}
      <TextAreaField
        label="Escribe a tu equipo"
        hint="Cómo te fue, una duda o algo que deban saber. Hasta 2 000 caracteres."
        maxLength={2_000}
        rows={4}
        value={body}
        disabled={!editable}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      <FormError error={record.error} title="No se envió la nota" />
      <Button type="submit" size="touch" disabled={!editable || record.isPending || !body.trim()}>
        Enviar nota
      </Button>
    </form>
  );
}
