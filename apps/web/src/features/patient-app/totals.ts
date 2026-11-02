import { formatNumber, type DayTotal } from '@nutricoach/contracts';

/** Un total del día con lo que falta a la vista (RN-I03): «al menos 1,250» si a algún registro le falta el dato. */
export function totalText(total: DayTotal, kind: 'kcal' | 'grams'): string {
  if (total.missing === 0) return formatNumber(total.value, kind);
  return total.known === 0 ? 'sin dato' : `al menos ${formatNumber(total.known, kind)}`;
}
