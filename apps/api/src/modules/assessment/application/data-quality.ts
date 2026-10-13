import { CONSOLIDATE_ISAK, MDC95, runMethod, TEM_ISAK } from '@nutricoach/engine';
import type { Consolidation, SiteDefinition } from '../domain/assessment-rules.js';

const ONE_ATTEMPT: Consolidation = { value: null, diffPct: null, needsThird: false, method: null };

/**
 * Consolidación de un sitio con el motor (CONSOLIDATE_ISAK, RN-C02 y RN-C03): media de dos tomas válidas, mediana
 * de tres. Con una sola toma todavía no hay consolidado. Sin redondear (RN-D09).
 */
export function consolidate(site: SiteDefinition, attempts: readonly number[]): Consolidation {
  if (attempts.length < 2) return ONE_ATTEMPT;
  const run = runMethod(CONSOLIDATE_ISAK, {
    family: site.family === 'SKINFOLD' ? 'SKINFOLD' : 'OTHER',
    attempts,
  });
  // Los rangos del catálogo ya se validaron; un error del motor aquí sería una falla técnica.
  if (!run.ok)
    throw new Error(`CONSOLIDATE_ISAK rechazó ${site.code}: ${run.errors[0]?.code ?? ''}`);
  const { value, diffPct, needsThird, consolidation } = run.result.outputs;
  return {
    value,
    diffPct: Number.isFinite(diffPct) ? diffPct : null,
    needsThird,
    method: consolidation,
  };
}

/** Lo que dice el motor de las dos primeras tomas: decide si la tercera hace falta (RN-C02). */
export const firstTwo = (
  site: SiteDefinition,
  attempts: readonly number[],
): Consolidation | null => (attempts.length >= 2 ? consolidate(site, attempts.slice(0, 2)) : null);

export interface TechnicalError {
  readonly temAbs: number;
  readonly temRelPct: number;
  readonly methodVersion: string;
}

/** ETM = √(Σd² / 2n) y %ETM = ETM / media × 100 (TEM_ISAK, RN-C05); null si los pares no dan un ETM. */
export function technicalError(
  pairs: readonly (readonly [number, number])[],
): TechnicalError | null {
  const run = runMethod(TEM_ISAK, { pairs });
  if (!run.ok || !Number.isFinite(run.result.outputs.temRelPct)) return null;
  return { ...run.result.outputs, methodVersion: run.result.methodVersion };
}

/** CMD95 = 1.96 × √2 × error de medida (MDC95, RN-C05). */
export function mdc95(measurementError: number): number {
  const run = runMethod(MDC95, { measurementError });
  if (!run.ok) throw new Error('MDC95 recibió un error de medida inválido.');
  return run.result.outputs.mdc95;
}
