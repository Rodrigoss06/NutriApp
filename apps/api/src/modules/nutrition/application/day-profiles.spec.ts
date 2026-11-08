import { describe, expect, it } from 'vitest';
import { INVALID_PLAN } from '../domain/nutrition-plan.js';
import { dayProfileTargetsOf } from './day-profiles.js';

describe('RN-E07 · 07 §2 · las metas de cada perfil de día: mandan los gramos (P-20.2)', () => {
  it('sin perfiles, el plan tiene una sola meta: la de la prescripción', () => {
    expect(dayProfileTargetsOf([])).toEqual({ ok: true, value: [] });
  });

  it('cada perfil con sus gramos, las kcal de Atwater y su método: el descanso de Mateo da 2,230 kcal', () => {
    const result = dayProfileTargetsOf([
      { code: 'REST', name: ' Descanso ', choG: 240, proteinG: 160, fatG: 70 },
      { code: 'ALTO', name: 'Alto', choG: 330, proteinG: 160, fatG: 70 },
    ]);
    if (!result.ok) expect.fail(result.error.message);
    const [rest, high] = result.value;
    expect(rest).toMatchObject({ code: 'REST', name: 'Descanso', kcal: 2230, choG: 240 });
    expect(rest?.method).toMatchObject({
      methodCode: 'MACROS_DAY_PROFILE',
      methodVersion: '1.0.0',
    });
    expect(rest?.method.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(high?.kcal).toBe(2590);
  });

  it('con perfiles que no cuadran o gramos en 0 no se guarda: 422 con cada problema', () => {
    const repeated = dayProfileTargetsOf([
      { code: 'REST', name: 'Descanso', choG: 240, proteinG: 160, fatG: 70 },
      { code: 'REST', name: 'Otro', choG: 240, proteinG: 160, fatG: 70 },
    ]);
    if (repeated.ok) expect.fail('Se esperaba un error.');
    expect(repeated.error).toMatchObject({
      code: INVALID_PLAN,
      details: { problems: ['Dos perfiles no pueden tener el mismo código (REST).'] },
    });

    const empty = dayProfileTargetsOf([
      { code: 'REST', name: 'Descanso', choG: 0, proteinG: 0, fatG: 0 },
    ]);
    if (empty.ok) expect.fail('Se esperaba un error.');
    expect(empty.error.details).toEqual({
      problems: [
        'El perfil «Descanso»: los gramos de un perfil de día no son negativos, y al menos uno es mayor que 0.',
      ],
    });
  });
});
