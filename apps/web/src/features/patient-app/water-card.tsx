'use client';

import type { HydrationLog, LogHydration } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { GlassWater } from 'lucide-react';
import { FormError } from '@/features/forms/form-error';
import { newClientId, useRecord } from './records';

const GLASSES = [250, 500] as const;

/** El agua del día frente a la meta de hidratación del plan (RN-E13, RF-28): un toque por vaso. */
export function WaterCard({
  localDate,
  waterMl,
  targetMl,
  editable,
}: {
  localDate: string;
  waterMl: number;
  targetMl: number | null;
  editable: boolean;
}) {
  const record = useRecord<LogHydration, HydrationLog>('/me/hydration-logs');
  return (
    <section aria-labelledby="agua-dia" className="rounded-xl border border-border bg-card p-4">
      <h2 id="agua-dia" className="flex items-center gap-2 text-lg font-semibold">
        <GlassWater aria-hidden className="size-5" /> Agua
      </h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatNumber(waterMl, 'grams')} ml
        {targetMl ? (
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            de {formatNumber(targetMl, 'grams')} ml
          </span>
        ) : null}
      </p>
      {record.isSuccess ? (
        <Notice tone="success" title="Registrado">
          {formatNumber(record.data.volumeMl, 'grams')} ml de agua.
        </Notice>
      ) : null}
      <FormError error={record.error} title="No se registró el agua" />
      <div className="mt-3 flex gap-2">
        {GLASSES.map((volumeMl) => (
          <Button
            key={volumeMl}
            variant="secondary"
            size="touch"
            className="flex-1"
            disabled={!editable || record.isPending}
            onClick={() => {
              record.mutate({ clientId: newClientId(), localDate, volumeMl });
            }}
          >
            + {volumeMl} ml
          </Button>
        ))}
      </div>
    </section>
  );
}
