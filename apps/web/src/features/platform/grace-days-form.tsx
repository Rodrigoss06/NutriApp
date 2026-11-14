'use client';

import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { setGraceDays } from './platform-api';

/** Los días de gracia tras el vencimiento, de 0 a 30, antes de pasar a solo lectura (RN-A02). Solo los cambia la plataforma. */
export function GraceDaysForm({ organizationId }: { organizationId: string }) {
  const [value, setValue] = useState('7');
  const save = useMutation({ mutationFn: () => setGraceDays(organizationId, Number(value)) });
  return (
    <section aria-labelledby="gracia" className="flex flex-col gap-3">
      <h2 id="gracia" className="text-lg font-semibold">
        Días de gracia
      </h2>
      <form
        aria-label="Días de gracia"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <TextField
          label="Días tras el vencimiento"
          hint="De 0 a 30; 7 de fábrica."
          type="number"
          inputMode="numeric"
          min={0}
          max={30}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button type="submit" disabled={save.isPending}>
          Guardar
        </Button>
        <div className="w-full">
          <FormError error={save.error} title="No se guardaron los días de gracia" />
          {save.isSuccess ? <Notice tone="success" title="Días de gracia guardados" /> : null}
        </div>
      </form>
    </section>
  );
}
