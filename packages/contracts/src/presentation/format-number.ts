/**
 * Redondeo solo al presentar (RN-D09): masas y porcentajes con 1 decimal; medidas en mm y cm con 1; densidad
 * con 5; índices con 1; cintura/talla y cintura/cadera con 2; puntajes Z con 2; kcal, gramos e intercambios
 * enteros. Lo que RN-D09 no fija (ADR-049): ETM, %ETM y CMD95 con 2, superficie corporal con 2 y meses con 1.
 * Formato es-PE: punto decimal y coma de miles. La interpretación usa siempre el valor sin redondear.
 */
export const NUMBER_KINDS = {
  mass: 1,
  percent: 1,
  length: 1,
  density: 5,
  index: 1,
  /** Solo cintura/talla y cintura/cadera: con 1 decimal, 0.491 se vería 0.5, justo el umbral. */
  waistRatio: 2,
  zScore: 2,
  /** ETM, %ETM y CMD95: son décimas de milímetro; con 1 decimal, 0.374 mm se vería 0.4 (ADR-049). */
  measurementError: 2,
  /** Superficie corporal en m² (ADR-049). */
  bodySurface: 2,
  /** Meses hasta la meta: estimación inicial (RN-E05, ADR-049). */
  months: 1,
  kcal: 0,
  grams: 0,
  exchanges: 0,
} as const;

export type NumberKind = keyof typeof NUMBER_KINDS;

const formatters = new Map<NumberKind, Intl.NumberFormat>();

function formatter(kind: NumberKind): Intl.NumberFormat {
  let existing = formatters.get(kind);
  if (!existing) {
    const digits = NUMBER_KINDS[kind];
    existing = new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(kind, existing);
  }
  return existing;
}

/** Número clínico listo para mostrar; sin valor, una raya. */
export function formatNumber(value: number | null | undefined, kind: NumberKind): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(kind).format(value);
}

/**
 * Lee lo que escribe el profesional en un campo de medida: acepta coma o punto como decimal. En las medidas
 * no hay miles, así que la coma siempre es decimal. Devuelve null si no es un número.
 */
export function parseDecimal(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
