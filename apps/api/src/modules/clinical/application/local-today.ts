/** La fecha local (YYYY-MM-DD) en una zona horaria: la edad y los días del paciente se cuentan así (RN-G04). */
export function localToday(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
