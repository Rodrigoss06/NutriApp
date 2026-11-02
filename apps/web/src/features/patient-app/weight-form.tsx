'use client';

import type { LogMetric, MetricLog } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/contracts';
import { Button, Notice, NumberField } from '@nutricoach/ui';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { newClientId, useRecord } from './records';

/** El peso en casa, si tu profesional lo habilitó (07 §9): de 20 a 300 kg (RN-C04). */
export function WeightForm({ localDate, editable }: { localDate: string; editable: boolean }) {
  const [value, setValue] = useState<number | null>(null);
  const record = useRecord<LogMetric, MetricLog>('/me/metrics');
  const valid = value !== null && value >= 20 && value <= 300;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        record.mutate({ clientId: newClientId(), localDate, metricCode: 'BODY_WEIGHT', value });
      }}
    >
      {record.isSuccess ? (
        <Notice tone="success" title="Peso registrado">
          {formatNumber(record.data.value, 'mass')} kg.
        </Notice>
      ) : null}
      <NumberField
        label="Peso de hoy"
        unit="kg"
        value={value}
        onValueChange={setValue}
        hint="En ayunas y con poca ropa, si puedes."
        error={value !== null && !valid ? 'Escribe un peso entre 20 y 300 kg.' : undefined}
      />
      <FormError error={record.error} title="No se registró el peso" />
      <Button type="submit" size="touch" disabled={!editable || !valid || record.isPending}>
        Registrar peso
      </Button>
    </form>
  );
}
