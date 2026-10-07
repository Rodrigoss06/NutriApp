/**
 * Redondeo solo al presentar (RN-D09): masas y porcentajes con 1 decimal; medidas en mm y cm con 1; densidad
 * con 5; índices con 1; puntajes Z con 2; kcal, gramos e intercambios enteros. Formato es-PE: punto decimal
 * y coma de miles.
 */
export const NUMBER_KINDS = {
  mass: 1,
  percent: 1,
  length: 1,
  density: 5,
  index: 1,
  zScore: 2,
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
