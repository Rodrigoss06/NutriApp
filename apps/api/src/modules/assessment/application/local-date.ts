/** La fecha local (YYYY-MM-DD) de un instante en la zona horaria del paciente: el día de la evaluación (05 §2). */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
