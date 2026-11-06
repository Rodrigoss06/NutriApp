'use client';

import { formatNumber } from '@nutricoach/ui';
import { TargetVsActualChart } from '@nutricoach/ui/chart';
import type { DietChartPoint } from './diet-view';

/** RF-32: la energía de cada día contra su meta, con la tendencia del rango. Recharts solo en el cliente. */
export function DietChart({ points }: { points: readonly DietChartPoint[] }) {
  return (
    <TargetVsActualChart
      title="Energía por día contra la meta"
      description="Un día sin registros queda vacío: no cuenta como 0."
      unit="kcal"
      categoryName="Día"
      format={(value) => formatNumber(value, 'kcal')}
      points={points}
    />
  );
}
