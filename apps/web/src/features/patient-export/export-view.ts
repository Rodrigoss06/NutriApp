import type { PatientExport } from '@nutricoach/contracts';

/** El tamaño del ZIP para leerlo, en formato es-PE: «820 KB», «1.2 MB» (RN-D09: se redondea solo al mostrar). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`;
}

/** Si hay una preparándose: mientras tanto se vuelve a preguntar y no se ofrece pedir otra. */
export const hasPending = (exports: readonly PatientExport[]): boolean =>
  exports.some((item) => item.status === 'PENDING');
