import { kg, ONERM_BRZYCKI1993, ONERM_EPLEY1985, runMethod } from '@nutricoach/engine';
import type { OneRmEstimate } from '../domain/one-rm.js';

const METHODS = { ONERM_EPLEY1985, ONERM_BRZYCKI1993 } as const;

/** El 1RM de una serie con la fórmula del paciente (RN-F04): Epley o Brzycki, del motor. Otra fórmula o una serie inválida, null. */
export const estimateOneRm: OneRmEstimate = (formula, loadKg, reps) => {
  const method = METHODS[formula as keyof typeof METHODS] as
    (typeof METHODS)[keyof typeof METHODS] | undefined;
  if (!method) return null;
  const run = runMethod(method, { loadKg: kg(loadKg), reps });
  return run.ok ? run.result.outputs.oneRmKg : null;
};

/** El método de una fórmula, para mostrarlo junto a cada 1RM (RN-D02). */
export function oneRmMethod(
  formula: string,
): { readonly code: string; readonly version: string } | null {
  const method = METHODS[formula as keyof typeof METHODS] as
    (typeof METHODS)[keyof typeof METHODS] | undefined;
  return method ? { code: method.code, version: method.version } : null;
}
