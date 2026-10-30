import { describe, expect, it } from 'vitest';
import { expectErrors, expectOk } from '../../test/support.js';
import { runMethod } from '../registry/run-method.js';
import { PRI_JV, SCORED_QUESTIONS, type PerformanceAnswers } from './performance-profile.js';

const profile = (answers: PerformanceAnswers) => expectOk(runMethod(PRI_JV, { answers })).outputs;
const points = (answers: PerformanceAnswers) => profile(answers).points;

/** Una pregunta de escala por dominio, para fijar su puntaje: 1 a 5 dan 20 a 100. */
const domains = (scales: Partial<Record<'obj' | 'ava' | 'exp' | 'rec' | 'adh', number>>) => ({
  G03: scales.obj ?? null,
  A03: scales.ava ?? null,
  E03: scales.exp ?? null,
  R02: scales.rec ?? null,
  H01: scales.adh ?? null,
});

describe('RN-F16 · puntos de cada pregunta (07 §12)', () => {
  it('son las 29 preguntas que puntúan', () => {
    expect(SCORED_QUESTIONS).toHaveLength(29);
  });

  it.each([
    ['A01', 7, 5],
    ['A01', 5, 5],
    ['A01', 4, 4],
    ['A01', 3, 3],
    ['A01', 2, 2],
    ['A01', 1, 1],
    ['A01', 0, 1],
    ['A02', 75, 5],
    ['A02', 74, 4],
    ['A02', 60, 4],
    ['A02', 45, 3],
    ['A02', 30, 2],
    ['A02', 29, 1],
    ['R01', 8, 5],
    ['R01', 7.5, 4],
    ['R01', 7, 4],
    ['R01', 6, 3],
    ['R01', 5, 2],
    ['R01', 4.9, 1],
    ['L01', 3, 5],
    ['L01', 4, 5],
    ['L01', 5, 4],
    ['L01', 6, 4],
    ['L01', 8, 3],
    ['L01', 10, 2],
    ['L01', 11, 1],
    ['L02', 10000, 5],
    ['L02', 7500, 4],
    ['L02', 5000, 3],
    ['L02', 3000, 2],
    ['L02', 2999, 1],
    ['N04', 2.5, 5],
    ['N04', 2, 4],
    ['N04', 1.5, 3],
    ['N04', 1, 2],
    ['N04', 0.5, 1],
  ] as const)('umbral de %s con %d: %d puntos', (code, answer, expected) => {
    expect(points({ [code]: answer })[code]).toBe(expected);
  });

  it.each([
    ['E01', 'LT_3M', 1],
    ['E01', 'M3_12', 2],
    ['E01', 'Y1_3', 4],
    ['E01', 'GT_3Y', 5],
    ['E02', 'CONSISTENT', 5],
    ['E02', 'INTERMITTENT', 3],
    ['E02', 'INACTIVE', 1],
    ['L03', 'NO', 5],
    ['L03', 'OCCASIONAL', 4],
    ['L03', 'WEEKLY', 3],
    ['L03', 'FREQUENT', 1],
    ['L04', 'NO', 5],
    ['L04', 'YES', 2],
    ['N01', 'STRUCTURED', 5],
    ['N01', 'VARIABLE', 3],
    ['N01', 'RESTRICTIVE', 2],
    ['N01', 'OTHER', 3],
    ['N02', 'USUALLY', 5],
    ['N02', 'SOMETIMES', 3],
    ['N02', 'RARELY', 1],
    ['N03', 'HIGH', 5],
    ['N03', 'MODERATE', 3],
    ['N03', 'LOW', 1],
  ] as const)('opción de %s, %s: %d puntos', (code, answer, expected) => {
    expect(points({ [code]: answer })[code]).toBe(expected);
  });

  it('las directas valen su respuesta y las inversas, 6 menos la respuesta (R04, R05 y H03)', () => {
    expect(points({ G03: 2, R02: 5, H05: 1 })).toEqual({ G03: 2, R02: 5, H05: 1 });
    expect(points({ R04: 1, R05: 5, H03: 2 })).toEqual({ R04: 5, R05: 1, H03: 4 });
  });

  it.each([
    ['G03', 0],
    ['G03', 6],
    ['G03', 3.5],
    ['G03', '3'],
    ['R04', 7],
    ['A01', 3.5],
    ['A01', -1],
    ['A01', 'muchos'],
    ['E01', 'NUNCA'],
    ['E01', 4],
  ] as const)('NC-ENG-405: rechaza %s con %s', (code, answer) => {
    expect(expectErrors(runMethod(PRI_JV, { answers: { [code]: answer } }))).toEqual([
      { rule: 'RN-F16', code: 'NC-ENG-405', severity: 'ERROR' },
    ]);
  });
});

describe('RN-F16 · dominios y PRI', () => {
  it('un dominio promedia solo sus preguntas respondidas: las vacías no cuentan', () => {
    const { domainScores } = profile({ G03: 5, G04: null, R02: 2, R03: 4 });

    expect(domainScores.OBJECTIVE).toBe(100);
    expect(domainScores.RECOVERY).toBe(60);
    expect(domainScores.ADHERENCE).toBeNull();
  });

  it('P-10: el PRI pondera solo los dominios respondidos', () => {
    expect(profile(domains({ rec: 5, adh: 3 })).pri).toBe(80);
    expect(profile(domains({ obj: 5 })).pri).toBe(100);
  });

  it('sin ninguna respuesta no hay PRI ni clases: un dato que falta no es cero', () => {
    expect(profile({})).toEqual({
      points: {},
      domainScores: {
        OBJECTIVE: null,
        AVAILABILITY: null,
        EXPERIENCE: null,
        RECOVERY: null,
        LIFESTYLE: null,
        NUTRITION: null,
        ADHERENCE: null,
      },
      pri: null,
      classes: {
        recoveryCapacity: null,
        availability: null,
        experience: null,
        adherenceRisk: null,
        volumeTolerance: null,
        supervision: null,
        checkIn: null,
        topPriority: null,
      },
    });
  });

  it('guarda método, versión e insumos con su hash, sin importar el orden de las claves (RN-D01)', () => {
    const first = expectOk(runMethod(PRI_JV, { answers: { G03: 4, H01: 2 } }));
    const second = expectOk(runMethod(PRI_JV, { answers: { H01: 2, G03: 4 } }));

    expect(first).toMatchObject({ methodCode: 'PRI_JV', methodVersion: '2.0.0' });
    expect(first.inputsHash).toBe(second.inputsHash);
  });
});

describe('RN-F16 · clases del perfil', () => {
  it.each([
    [5, 'HIGH', 'HIGH', 'ADVANCED'],
    [4, 'HIGH', 'HIGH', 'ADVANCED'],
    [3, 'MODERATE', 'MODERATE', 'INTERMEDIATE'],
    [2, 'LOW', 'LIMITED', 'BASIC'],
  ] as const)(
    'con %i de 5 (corte en 80 y 60): %s, %s y %s',
    (scale, recovery, available, experience) => {
      const { classes } = profile(domains({ rec: scale, ava: scale, exp: scale }));

      expect(classes.recoveryCapacity).toBe(recovery);
      expect(classes.availability).toBe(available);
      expect(classes.experience).toBe(experience);
    },
  );

  it.each([
    [4, 'LOW', 'BIWEEKLY'],
    [3, 'MODERATE', 'WEEKLY_OR_BIWEEKLY'],
    [2, 'HIGH', 'WEEKLY'],
  ] as const)('adherencia %i de 5: riesgo %s, check-in %s', (scale, risk, checkIn) => {
    const { classes } = profile(domains({ adh: scale }));

    expect(classes.adherenceRisk).toBe(risk);
    expect(classes.checkIn).toBe(checkIn);
  });

  it('la tolerancia inicial al volumen sale del menor de recuperación, disponibilidad y experiencia', () => {
    const tolerance = (rec: number, ava: number, exp: number) =>
      profile(domains({ rec, ava, exp })).classes.volumeTolerance;

    expect(tolerance(5, 4, 4)).toBe('HIGH');
    expect(tolerance(5, 3, 5)).toBe('MODERATE');
    expect(tolerance(5, 5, 2)).toBe('CONSERVATIVE');
  });

  it('la supervisión es baja con experiencia y adherencia de 80 o más, moderada con ambas de 60 o más; si no, alta', () => {
    const supervision = (exp: number, adh: number) =>
      profile(domains({ exp, adh })).classes.supervision;

    expect(supervision(4, 5)).toBe('LOW');
    expect(supervision(4, 3)).toBe('MODERATE');
    expect(supervision(5, 2)).toBe('HIGH');
    expect(supervision(2, 5)).toBe('HIGH');
  });

  it('sin uno de sus dominios la clase queda sin dato, como la hoja', () => {
    const { classes } = profile(domains({ rec: 5, ava: 5, adh: 5 }));

    expect(classes.volumeTolerance).toBeNull();
    expect(classes.supervision).toBeNull();
    expect(classes.experience).toBeNull();
  });

  it('la prioridad es el dominio con el puntaje más bajo; en un empate, el primero de la hoja', () => {
    expect(profile(domains({ obj: 4, rec: 2, adh: 3 })).classes.topPriority).toBe('RECOVERY');
    expect(profile(domains({ obj: 3, ava: 3, adh: 3 })).classes.topPriority).toBe('OBJECTIVE');
  });
});
