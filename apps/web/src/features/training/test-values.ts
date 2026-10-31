import {
  parseDecimal,
  saveMovementTestSchema,
  savePhysicalResultSchema,
} from '@nutricoach/contracts';

const NO_SCORE = 'NONE';

/** La escala de cada lado (07 §3.3). Sin puntaje es una respuesta posible: la prueba queda pendiente. */
export const SCORE_OPTIONS = [
  { value: NO_SCORE, label: 'Sin puntaje' },
  { value: '2', label: '2 · Adecuado' },
  { value: '1', label: '1 · Compensación leve' },
  { value: '0', label: '0 · Limitación clara' },
] as const;

export const scoreText = (score: number | null): string =>
  score === null ? NO_SCORE : String(score);
export const scoreOf = (text: string): number | null => (text === NO_SCORE ? null : Number(text));

export const textOrNull = (text: string): string | null => text.trim() || null;

/** El problema del enlace de evidencia, o null si sirve o está vacío (07 §4): solo https. */
export function evidenceUrlProblem(text: string): string | null {
  const parsed = saveMovementTestSchema.shape.evidenceUrl.safeParse(textOrNull(text));
  return parsed.success ? null : 'Usa un enlace completo que empiece con https://.';
}

/** El problema del valor de una prueba física, o null si sirve: se guarda con 2 decimales, sin redondear en silencio. */
export function physicalValueProblem(text: string): string | null {
  const value = parseDecimal(text);
  if (value === null) return 'Escribe el valor medido.';
  return savePhysicalResultSchema.shape.value.safeParse(value).success
    ? null
    : 'Usa un número de 0 en adelante, con hasta 2 decimales.';
}
