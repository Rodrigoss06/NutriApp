import { describe, expect, it } from 'vitest';
import {
  ANTHROPOMETRIC_KINDS,
  physicalTestSummary,
  type ClosedPhysicalEvaluation,
} from './functional-evaluation.js';

const closed = (
  moment: ClosedPhysicalEvaluation['moment'],
  localDate: string,
  values: Readonly<Record<string, number>>,
): ClosedPhysicalEvaluation => ({
  moment,
  localDate,
  results: Object.entries(values).map(([testCode, value]) => ({ testCode, value })),
});

describe('07 §4 · el resumen de cada prueba física', () => {
  const summaryOf = (evaluations: readonly ClosedPhysicalEvaluation[]) =>
    physicalTestSummary(['WALK_6MIN', 'GRIP_R'], evaluations);

  it('sin valor inicial: PENDIENTE', () => {
    expect(summaryOf([])[0]).toEqual({
      testCode: 'WALK_6MIN',
      baseline: null,
      week4: null,
      week8: null,
      week12: null,
      retest: null,
      change: null,
      status: 'PENDING',
    });
    // La semana 12 sola tampoco alcanza: falta con qué comparar.
    expect(summaryOf([closed('WEEK_12', '2026-12-20', { WALK_6MIN: 500 })])[0]).toMatchObject({
      week12: 500,
      change: null,
      status: 'PENDING',
    });
  });

  it('con la inicial y sin la semana 12: BASE REGISTRADA', () => {
    expect(
      summaryOf([
        closed('BASELINE', '2026-10-01', { WALK_6MIN: 420 }),
        closed('WEEK_4', '2026-10-29', { WALK_6MIN: 450 }),
      ])[0],
    ).toMatchObject({
      baseline: 420,
      week4: 450,
      change: null,
      status: 'BASELINE_RECORDED',
    });
  });

  it('con las dos: REVISAR CAMBIO, con semana 12 menos inicial', () => {
    const [walk, grip] = summaryOf([
      closed('BASELINE', '2026-10-01', { WALK_6MIN: 420 }),
      closed('WEEK_12', '2026-12-24', { WALK_6MIN: 505.5, GRIP_R: 30 }),
    ]);

    expect(walk).toMatchObject({ change: 85.5, status: 'REVIEW_CHANGE' });
    // Cada prueba va por su cuenta: esta no tiene valor inicial.
    expect(grip).toMatchObject({ baseline: null, week12: 30, status: 'PENDING' });
  });

  it('una caída también es un cambio, y un cero es un dato', () => {
    expect(
      summaryOf([
        closed('BASELINE', '2026-10-01', { WALK_6MIN: 0 }),
        closed('WEEK_12', '2026-12-24', { WALK_6MIN: 0 }),
      ])[0],
    ).toMatchObject({ baseline: 0, change: 0, status: 'REVIEW_CHANGE' });
  });

  it('de dos evaluaciones del mismo momento, vale la más reciente', () => {
    expect(
      summaryOf([
        closed('RETEST', '2026-11-01', { WALK_6MIN: 430 }),
        closed('RETEST', '2026-11-20', { WALK_6MIN: 440 }),
        closed('BASELINE', '2026-10-20', { WALK_6MIN: 410 }),
        closed('BASELINE', '2026-10-01', { WALK_6MIN: 400 }),
      ])[0],
    ).toMatchObject({ retest: 440, baseline: 410 });
  });

  it('una prueba que la más reciente no midió se toma de la anterior', () => {
    expect(
      summaryOf([
        closed('BASELINE', '2026-10-20', { GRIP_R: 25 }),
        closed('BASELINE', '2026-10-01', { WALK_6MIN: 400 }),
      ])[0],
    ).toMatchObject({ baseline: 400 });
  });
});

describe('RF-41 · la postura y las pruebas físicas no se confunden con la antropometría', () => {
  it('solo estos tipos pasan por el cálculo, las fichas y la comparación', () => {
    expect(ANTHROPOMETRIC_KINDS).toEqual(['ANTHROPOMETRY', 'BIA', 'MIXED']);
  });
});
