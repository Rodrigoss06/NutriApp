import { describe, expect, it } from 'vitest';
import { andThen, err, isErr, isOk, map, ok, type Result } from './result.js';

const half = (n: number): Result<number, string> =>
  n % 2 === 0 ? ok(n / 2) : err(`${n} es impar`);

const failure = (error: string): Result<number, string> => err(error);

describe('02 §5 · Result: errores de dominio esperados sin excepciones', () => {
  it('ok envuelve un valor', () => {
    const result = ok(42);

    expect(result).toEqual({ ok: true, value: 42 });
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it('err envuelve un error', () => {
    const result = err('NC-ASM-004');

    expect(result).toEqual({ ok: false, error: 'NC-ASM-004' });
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it('map transforma solo el valor de un ok', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    expect(map(failure('falla'), (n) => n * 10)).toEqual(err('falla'));
  });

  it('andThen encadena pasos que pueden fallar y se detiene en el primer error', () => {
    expect(andThen(ok(8), half)).toEqual(ok(4));
    expect(andThen(ok(3), half)).toEqual(err('3 es impar'));
    expect(andThen(failure('previo'), half)).toEqual(err('previo'));
  });

  it('un resultado no se puede modificar', () => {
    expect(Object.isFrozen(ok(1))).toBe(true);
    expect(Object.isFrozen(err('x'))).toBe(true);
  });
});
