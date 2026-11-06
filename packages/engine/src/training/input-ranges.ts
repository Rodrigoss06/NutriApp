import type { Issue } from '../registry/types.js';

/** Un rango cerrado; POSITIVE es «mayor que 0», sin tope. */
export type Bounds = readonly [min: number, max: number] | 'POSITIVE';
/** Un insumo con su nombre para el mensaje, su valor (null es «sin dato») y su rango. */
export type Range = readonly [
  field: string,
  value: number | null,
  bounds: Bounds,
  integer?: boolean,
];

const within = (value: number, bounds: Bounds): boolean =>
  bounds === 'POSITIVE' ? value > 0 : value >= bounds[0] && value <= bounds[1];

const describeBounds = (bounds: Bounds): string => {
  if (bounds === 'POSITIVE') return 'mayor que 0';
  const [min, max] = bounds;
  return max === Infinity ? `${String(min)} o más` : `de ${String(min)} a ${String(max)}`;
};

/** Lo que está fuera de rango, con su regla y su código. Un insumo sin dato no se valida. */
export function outOfRange(ranges: readonly Range[], issue: Omit<Issue, 'message'>): Issue[] {
  return ranges.flatMap(([field, value, bounds, integer = false]) => {
    if (value === null) return [];
    if (Number.isFinite(value) && within(value, bounds) && (!integer || Number.isInteger(value))) {
      return [];
    }
    const kind = integer ? ', entero' : '';
    return [{ ...issue, message: `${field} fuera de rango (${describeBounds(bounds)}${kind}).` }];
  });
}
