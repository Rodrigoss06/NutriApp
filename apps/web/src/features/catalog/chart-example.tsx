'use client';

import { formatNumber } from '@nutricoach/ui';
import { TargetVsActualChart } from '@nutricoach/ui/chart';

const WEEK = [1790, 1950, 1600, 2100, 1830, 2400, 1700];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** La semana de G-20 contra la meta de 1835 kcal. */
export function ChartExample() {
  return (
    <TargetVsActualChart
      title="Energía consumida contra la meta (semana de ejemplo)"
      unit="kcal"
      format={(value) => formatNumber(value, 'kcal')}
      points={WEEK.map((actual, index) => ({ label: DAYS[index] ?? '', target: 1835, actual }))}
    />
  );
}
