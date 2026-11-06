import { ADEQUACY, runMethod } from '@nutricoach/engine';
import type { AdequacyRule } from '../domain/daily-summary.js';
import type { AverageAdequacy } from '../domain/diet-weeks.js';

/** El método de cada adecuación de la analítica (RN-D02). */
export const ADEQUACY_METHOD = { code: 'ADEQUACY', version: ADEQUACY.version } as const;

type Range = readonly [number, number];

/**
 * La adecuación de un día (RN-E10): lo consumido conocido sobre la meta. Con un dato faltante solo se sabe que está fuera de rango
 * si lo conocido ya pasa el máximo; si no, en rango queda sin saber («Faltan datos»).
 */
export function dayAdequacy(range: Range): AdequacyRule {
  return (total, target) => {
    if (target === null || !(target > 0) || total.known === null)
      return { pct: null, inRange: null };
    const run = runMethod(ADEQUACY, {
      prescribed: target,
      consumedDaily: [total.known],
      acceptableRangePct: [range[0], range[1]],
    });
    if (!run.ok) return { pct: null, inRange: null };
    const pct = run.result.outputs.adequacyPct;
    if (total.missing > 0) return { pct, inRange: pct > range[1] ? false : null };
    return { pct, inRange: run.result.outputs.daysInRange === 1 };
  };
}

/** La adecuación del promedio de una semana (RN-E10, RN-G09). */
export function averageAdequacy(range: Range): AverageAdequacy {
  return (consumedDaily, prescribed) => {
    const run = runMethod(ADEQUACY, {
      prescribed,
      consumedDaily,
      acceptableRangePct: [range[0], range[1]],
    });
    return run.ok ? run.result.outputs.adequacyPct : null;
  };
}
