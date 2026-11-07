'use client';

import { methodLabel } from '@nutricoach/contracts';
import { formatNumber, MethodBadge, Select } from '@nutricoach/ui';
import { TrendChart } from '@nutricoach/ui/chart';
import { useState } from 'react';
import { shortDate } from '@/features/analytics/diet-view';
import type { SeriesFormat, SeriesOption } from './evolution-view';

const READING = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

const formatterOf =
  (format: SeriesFormat) =>
  (value: number | null): string => {
    if (value === null) return '—';
    return format.type === 'number' ? formatNumber(value, format.kind) : READING.format(value);
  };

/**
 * La evolución en el tiempo (RF-35): una serie por gráfico, elegida de la lista. Así dos métodos nunca se dibujan juntos
 * (RN-D03) ni la bioimpedancia con la antropometría (RN-C08). Recharts solo en el cliente.
 */
export function EvolutionChart({ options }: { options: readonly SeriesOption[] }) {
  const [selected, setSelected] = useState(options[0]?.key ?? '');
  const current = options.find((option) => option.key === selected) ?? options[0];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Serie"
        hint="Cada serie es de un solo método: los métodos no se comparan entre sí."
        className="max-w-lg"
        value={current.key}
        onValueChange={setSelected}
        options={options.map((option) => ({ value: option.key, label: option.label }))}
      />
      <TrendChart
        title={current.label}
        description={
          current.methodCode ? (
            <MethodBadge label={methodLabel(current.methodCode)} code={current.methodCode} />
          ) : (
            'Lectura del equipo de bioimpedancia, cargada a mano.'
          )
        }
        unit={current.unit}
        categoryName="Evaluación"
        seriesName={current.label}
        format={formatterOf(current.format)}
        points={current.points.map((point) => ({
          label: shortDate(point.localDate),
          value: point.value,
        }))}
      />
    </div>
  );
}
