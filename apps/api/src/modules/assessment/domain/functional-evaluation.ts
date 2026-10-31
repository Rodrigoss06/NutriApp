import { domainError } from '@nutricoach/shared-kernel';

/** Los tipos que pasan por el cálculo, las fichas y la comparación: la postura y las pruebas físicas no (RF-41). */
export const ANTHROPOMETRIC_KINDS = ['ANTHROPOMETRY', 'BIA', 'MIXED'] as const;

export type FunctionalKind = 'MOVEMENT' | 'FITNESS';
export type PhysicalMoment = 'BASELINE' | 'WEEK_4' | 'WEEK_8' | 'WEEK_12' | 'RETEST';
export type EvaluationModality = 'IN_PERSON' | 'ONLINE' | 'HYBRID';
export type PhysicalTestStatus = 'PENDING' | 'BASELINE_RECORDED' | 'REVIEW_CHANGE';

export const FUNCTIONAL_EVALUATION_NOT_FOUND = domainError({
  code: 'NC-ASM-022',
  message: 'No encontramos esa evaluación.',
});
export const FUNCTIONAL_TEST_NOT_FOUND = domainError({
  code: 'NC-ASM-023',
  message: 'Esa prueba no es de esta evaluación.',
});
export const FUNCTIONAL_EVALUATION_EMPTY = domainError({
  code: 'NC-ASM-024',
  message: 'Registra al menos una prueba para cerrar la evaluación.',
});
export const UNSUPPORTED_FUNCTIONAL_EVIDENCE = domainError({
  code: 'NC-ASM-025',
  message: 'La evidencia debe ser un PDF, JPG o PNG.',
});

/** Una evaluación de pruebas físicas cerrada, con sus resultados. */
export interface ClosedPhysicalEvaluation {
  readonly moment: PhysicalMoment;
  /** YYYY-MM-DD, fecha local de la medición. */
  readonly localDate: string;
  readonly results: readonly { readonly testCode: string; readonly value: number }[];
}

export interface PhysicalTestSummaryRow {
  readonly testCode: string;
  readonly baseline: number | null;
  readonly week4: number | null;
  readonly week8: number | null;
  readonly week12: number | null;
  readonly retest: number | null;
  readonly change: number | null;
  readonly status: PhysicalTestStatus;
}

/**
 * Cada prueba física por momento (07 §4): de dos evaluaciones del mismo momento vale la más reciente que la midió. Cambio
 * = semana 12 − inicial. Estado: PENDIENTE sin valor inicial, BASE REGISTRADA sin semana 12, REVISAR CAMBIO con ambos.
 */
export function physicalTestSummary(
  testCodes: readonly string[],
  evaluations: readonly ClosedPhysicalEvaluation[],
): readonly PhysicalTestSummaryRow[] {
  const newestFirst = [...evaluations].sort((a, b) => b.localDate.localeCompare(a.localDate));
  const valueAt = (testCode: string, moment: PhysicalMoment): number | null => {
    for (const evaluation of newestFirst) {
      if (evaluation.moment !== moment) continue;
      const result = evaluation.results.find((r) => r.testCode === testCode);
      if (result) return result.value;
    }
    return null;
  };
  return testCodes.map((testCode) => {
    const baseline = valueAt(testCode, 'BASELINE');
    const week12 = valueAt(testCode, 'WEEK_12');
    const bothMeasured = baseline !== null && week12 !== null;
    const status: PhysicalTestStatus = bothMeasured
      ? 'REVIEW_CHANGE'
      : baseline === null
        ? 'PENDING'
        : 'BASELINE_RECORDED';
    return {
      testCode,
      baseline,
      week4: valueAt(testCode, 'WEEK_4'),
      week8: valueAt(testCode, 'WEEK_8'),
      week12,
      retest: valueAt(testCode, 'RETEST'),
      change: bothMeasured ? week12 - baseline : null,
      status,
    };
  });
}
