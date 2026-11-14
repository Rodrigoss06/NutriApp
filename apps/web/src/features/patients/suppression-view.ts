/** Si el código que escribió el dueño es el del paciente: sin espacios a los lados y sin distinguir mayúsculas, como la API (RN-B05). */
export const codeMatches = (typed: string, code: string): boolean =>
  typed.trim().toUpperCase() === code.trim().toUpperCase();
