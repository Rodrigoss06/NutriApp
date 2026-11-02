'use client';

import type { SettingsResponse } from '@nutricoach/contracts';
import { Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

const KEY = 'tracking.edit_window_days';

const daysText = (days: number) =>
  days === 0 ? 'Solo el mismo día' : `Hasta ${String(days)} ${days === 1 ? 'día' : 'días'} atrás`;

/** Hasta cuántos días atrás el paciente registra, corrige o anula (RN-G10, ADR-080): 3 por defecto, de 0 a 7. */
export function EditWindowSetting({ initial, canEdit }: { initial: number; canEdit: boolean }) {
  const canWrite = useCanWrite() && canEdit;
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: (next: number) =>
      apiFetch<SettingsResponse>(`/organization/settings/${KEY}`, {
        method: 'PUT',
        body: { value: next },
      }),
    onSuccess: (settings) => {
      setValue(settings[KEY]);
    },
  });
  return (
    <div className="flex max-w-xl flex-col gap-3">
      {canWrite ? (
        <Select
          label="Registros del paciente"
          hint="Después de este plazo, el día queda cerrado: el paciente ya no agrega, corrige ni anula lo de ese día."
          value={String(value)}
          onValueChange={(text) => {
            save.mutate(Number(text));
          }}
          options={[0, 1, 2, 3, 4, 5, 6, 7].map((days) => ({
            value: String(days),
            label: daysText(days),
          }))}
        />
      ) : (
        <p className="text-sm">{daysText(value)}. Lo cambian el dueño y los administradores.</p>
      )}
      {save.isSuccess ? <Notice tone="success" title="Plazo guardado" /> : null}
      <FormError error={save.error} title="No se guardó el plazo" />
    </div>
  );
}
