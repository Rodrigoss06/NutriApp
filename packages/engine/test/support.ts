import { expect } from 'vitest';
import type { CalculationResult, MethodRun } from '../src/registry/types.js';

/** Devuelve el resultado de una ejecución exitosa o hace fallar la prueba con sus errores. */
export function expectOk<TInput, TOutput>(
  run: MethodRun<TInput, TOutput>,
): CalculationResult<TInput, TOutput> {
  if (!run.ok) expect.fail(`El método falló: ${run.errors.map((e) => e.message).join('; ')}`);
  return run.result;
}

/** Devuelve las reglas y los códigos de una ejecución fallida. */
export function expectErrors<TInput, TOutput>(run: MethodRun<TInput, TOutput>) {
  if (run.ok) expect.fail('Se esperaba que el método no calculara.');
  return run.errors.map(({ rule, code, severity }) => ({ rule, code, severity }));
}

/** Tolerancia de 03 para kcal: 1 kcal de margen. */
export function expectKcal(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

/** Redondeo a la mitad hacia arriba, como `r()` de docs/reference/examples.ts. Solo para comparar en pruebas. */
export const roundHalfUp = (value: number, decimals: number): number =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;
