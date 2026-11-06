/** El día local de un instante en una zona horaria (RN-G04), como AAAA-MM-DD. */
export function localDateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}
