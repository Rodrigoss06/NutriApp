import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage } from './problem';

describe('06 §5 · mensajes de error en español', () => {
  it('un code conocido usa el texto de la web; uno desconocido, el título de la API', () => {
    expect(errorMessage(new ApiError(401, { code: 'NC-IAM-010' }))).toMatch(
      /^Correo o contraseña incorrectos/,
    );
    expect(errorMessage(new ApiError(422, { code: 'NC-TEN-001', title: 'Sin cupo.' }))).toBe(
      'Sin cupo.',
    );
  });

  it('429 dice cuántos minutos esperar según Retry-After', () => {
    expect(errorMessage(new ApiError(429, {}, 61))).toBe(
      'Demasiados intentos. Vuelve a intentar en 2 minutos.',
    );
    expect(errorMessage(new ApiError(429, {}, 30))).toBe(
      'Demasiados intentos. Vuelve a intentar en 1 minuto.',
    );
  });

  it('un 5xx muestra el requestId como código de referencia; sin respuesta, falla de conexión', () => {
    expect(errorMessage(new ApiError(500, { requestId: 'req-123' }))).toMatch(
      /Código de referencia: req-123/,
    );
    expect(errorMessage(new TypeError('fetch failed'))).toMatch(/conexión/);
  });
});
