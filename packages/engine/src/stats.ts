/** Suma sin redondeo. */
export const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** Media aritmética; NaN si no hay valores (quien llama valida antes). */
export const mean = (values: readonly number[]): number => sum(values) / values.length;

/** Mediana; con un número par de valores, la media de los dos centrales. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? Number.NaN) + upper) / 2;
}
