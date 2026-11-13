/**
 * Las horas se guardan en UTC y se muestran en la zona de la organización (RN-J03). Funciones puras con Intl, sin el reloj.
 */

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatter.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatter.set(timeZone, formatter);
  }
  return formatter;
}

/** Cuántos milisegundos adelanta la zona a UTC en ese instante (Lima: −5 h). */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** La fecha local (YYYY-MM-DD) de un instante en la zona. */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Date(instant.getTime() + offsetMs(instant, timeZone)).toISOString().slice(0, 10);
}

/** El instante en que empieza ese día local en la zona. Con cambio de horario, vuelve a medir el desfase en el resultado. */
export function startOfLocalDay(localDate: string, timeZone: string): Date {
  const midnightUtc = Date.parse(`${localDate}T00:00:00Z`);
  const guess = midnightUtc - offsetMs(new Date(midnightUtc), timeZone);
  return new Date(midnightUtc - offsetMs(new Date(guess), timeZone));
}

/** El día siguiente de una fecha local. */
export function nextLocalDate(localDate: string): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
