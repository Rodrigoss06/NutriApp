import { describe, expect, it } from 'vitest';
import type { PlanTargets } from './plan-calculation.js';
import { REST_DAY_CARBS_NEGATIVE, restDayTargetsOf } from './rest-day.js';

/**
 * La hoja piloto de JV Fitness (Mateo Prueba): 2,500 kcal el día de entrenamiento con 160 g de proteína y 70 g de grasa,
 * y 2,250 kcal el de descanso. La meta de la prescripción es la del día de entrenamiento (decisión de Rodrigo,
 * 2026-11-08).
 */
const TRAINING_DAY: PlanTargets = { kcal: 2500, choG: 307.5, proteinG: 160, fatG: 70 };

describe('RN-E07 · metas del día de descanso del plan (07 §2, P-20)', () => {
  it('sin kcal de descanso, el plan tiene una sola meta', () => {
    expect(restDayTargetsOf(TRAINING_DAY, null)).toEqual({ ok: true, value: null });
  });

  it('la proteína y la grasa del día de entrenamiento no cambian y los carbohidratos van por diferencia', () => {
    const result = restDayTargetsOf(TRAINING_DAY, 2250);
    if (!result.ok) expect.fail(result.error.message);
    if (!result.value) expect.fail('Se esperaban las metas del día de descanso.');
    const { method, ...targets } = result.value;
    expect(targets).toEqual({ kcal: 2250, choG: 245, proteinG: 160, fatG: 70 });
    expect(method).toMatchObject({
      methodCode: 'MACROS_REST_DAY',
      methodVersion: '1.0.0',
      warnings: [],
    });
    expect(method.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('con carbohidratos negativos el plan no se guarda', () => {
    const result = restDayTargetsOf(TRAINING_DAY, 1200);
    if (result.ok) expect.fail('Se esperaba un error.');
    expect(result.error).toMatchObject({ code: REST_DAY_CARBS_NEGATIVE, rule: 'RN-E07' });
  });
});
