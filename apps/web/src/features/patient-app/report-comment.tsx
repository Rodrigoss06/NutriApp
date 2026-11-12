'use client';

import {
  MESOCYCLE_REPORT_TEXT_MAX,
  type MesocycleReportCommentResponse,
} from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';

/**
 * El comentario del alumno en su informe del mesociclo (P-28; RN-G19): lo lee su coach y lo puede cambiar cuando quiera; vacío lo
 * borra. Cada envío lleva su Idempotency-Key (06 §5).
 */
export function ReportComment({ reportId, comment }: { reportId: string; comment: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(comment ?? '');
  const save = useMutation({
    mutationFn: () =>
      apiFetch<MesocycleReportCommentResponse>(`/me/mesocycle-reports/${reportId}/comment`, {
        method: 'PUT',
        body: { comment: text.trim() || null },
        headers: { 'Idempotency-Key': `report-comment:${crypto.randomUUID()}` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const unchanged = text.trim() === (comment ?? '');
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <TextAreaField
        label="Tu comentario"
        hint="Lo lee tu coach. Puedes cambiarlo cuando quieras."
        maxLength={MESOCYCLE_REPORT_TEXT_MAX}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {save.isSuccess && unchanged ? (
        <Notice tone="success" title="Tu comentario quedó guardado" />
      ) : null}
      <FormError error={save.error} title="No se guardó tu comentario" />
      <div>
        <Button type="submit" disabled={unchanged || save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar comentario'}
        </Button>
      </div>
    </form>
  );
}
