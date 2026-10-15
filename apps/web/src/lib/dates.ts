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

/** Minutos que la zona adelanta a UTC en ese instante (Lima: −300). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((local - at.getTime()) / 60_000);
}

/** El instante en que empieza ese día (YYYY-MM-DD) en la zona de la organización: los filtros por fecha (RF-06). */
export function dayStartIn(isoDate: string, timeZone: string): Date {
  const utcMidnight = new Date(`${isoDate}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight, timeZone) * 60_000);
}

/**
 * La hora local (YYYY-MM-DDTHH:mm, como la de un input datetime-local) en la zona de la organización, para medir
 * una evaluación (RN-C09): la persona escribe la hora del consultorio, no la de su navegador.
 */
export function localDateTimeIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part('year') ?? ''}-${part('month') ?? ''}-${part('day') ?? ''}T${part('hour') ?? ''}:${part('minute') ?? ''}`;
}

/** El instante (ISO, UTC) de una hora local (YYYY-MM-DDTHH:mm) en la zona de la organización. */
export function instantIn(localDateTime: string, timeZone: string): string {
  const asUtc = new Date(`${localDateTime}:00Z`);
  const guess = new Date(asUtc.getTime() - offsetMinutes(asUtc, timeZone) * 60_000);
  // Si el desfase cambia entre la suposición y el resultado (cambio de horario), se ajusta una vez.
  return new Date(asUtc.getTime() - offsetMinutes(guess, timeZone) * 60_000).toISOString();
}

/** Suma días a una fecha de calendario (YYYY-MM-DD). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
