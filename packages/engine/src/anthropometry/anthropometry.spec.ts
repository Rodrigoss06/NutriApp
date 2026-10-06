import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { cm, mm } from '../units.js';
import { CONSOLIDATE_ISAK, CORRECTED_GIRTH, MDC95, TEM_ISAK } from './index.js';

describe('RN-C02 · tolerancia por familia de medida', () => {
  it('fuera de los pliegues la tolerancia es 1 %', () => {
    const within = expectOk(runMethod(CONSOLIDATE_ISAK, { family: 'OTHER', attempts: [86, 86.8] }));
    const beyond = expectOk(runMethod(CONSOLIDATE_ISAK, { family: 'OTHER', attempts: [86, 87] }));

    expect(within.outputs).toMatchObject({ needsThird: false, consolidation: 'MEAN_2' });
    expect(beyond.outputs).toMatchObject({ needsThird: true, value: null });
  });

  it('una diferencia exactamente igual a la tolerancia no pide tercera toma', () => {
    expect(
      expectOk(runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [20, 21] })).outputs
        .needsThird,
    ).toBe(false);
  });

  it.each([[[12]], [[12, 12.2, 12.4, 12.6]]])(
    'pide 2 o 3 tomas: %j no se consolida',
    (attempts) => {
      expect(expectErrors(runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts }))).toEqual([
        { rule: 'RN-C02', code: 'NC-ENG-010', severity: 'ERROR' },
      ]);
    },
  );

  it('RN-C04 · un pliegue fuera de rango se rechaza', () => {
    expect(
      expectErrors(runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [12, 120] })),
    ).toEqual([{ rule: 'RN-C04', code: 'NC-ENG-001', severity: 'ERROR' }]);
  });

  it('dos tomas en cero no dividen por cero', () => {
    expect(
      expectOk(runMethod(CONSOLIDATE_ISAK, { family: 'SKINFOLD', attempts: [0, 0] })).outputs,
    ).toMatchObject({ value: 0, diffPct: 0, needsThird: false });
  });
});

describe('RN-C05 · ETM y CMD95', () => {
  it('pide al menos un par de tomas', () => {
    expect(expectErrors(runMethod(TEM_ISAK, { pairs: [] }))).toEqual([
      { rule: 'RN-C05', code: 'NC-ENG-011', severity: 'ERROR' },
    ]);
  });

  it('el CMD95 rechaza un error de medida negativo', () => {
    expect(expectErrors(runMethod(MDC95, { measurementError: -1 }))).toEqual([
      { rule: 'RN-C05', code: 'NC-ENG-012', severity: 'ERROR' },
    ]);
  });
});

describe('RN-D01 · perímetro corregido', () => {
  it('descuenta π × pliegue en centímetros: brazo de Luis 29.23 cm (G-09)', () => {
    expect(
      expectOk(runMethod(CORRECTED_GIRTH, { girthCm: cm(33), skinfoldMm: mm(12) })).outputs
        .correctedGirthCm,
    ).toBeCloseTo(29.23, 2);
  });
});
