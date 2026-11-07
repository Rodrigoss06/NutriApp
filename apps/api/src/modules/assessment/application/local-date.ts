/** La fecha local (YYYY-MM-DD) de un instante en la zona horaria del paciente: el día de la evaluación (05 §2). */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Minutos desde la medianoche de un instante en la zona del paciente: la hora de la evaluación (RN-C09). */
export function minutesOfDay(instant: Date, timeZone: string): number {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(instant)
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
}
