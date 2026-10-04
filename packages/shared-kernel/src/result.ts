/**
 * Resultado de una operación de dominio que puede fallar de forma esperada (02 §5).
 * Los errores de negocio viajan como valores; las excepciones quedan para fallas técnicas.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => Object.freeze({ ok: true as const, value });

export const err = <E>(error: E): Err<E> => Object.freeze({ ok: false as const, error });

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;

/** Transforma el valor de un `ok`; un `err` pasa sin cambios. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Encadena un paso que también puede fallar; se detiene en el primer error. */
export function andThen<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}
