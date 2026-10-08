/**
 * Fechas en es-PE (regla 9). Las fechas de calendario (YYYY-MM-DD, como ends_on) ya son locales de la organización
 * y se muestran sin cambiar de día; los instantes se muestran en la zona de la organización.
 */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** La fecha de hoy (YYYY-MM-DD) en la zona de la organización (RN-A02). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
