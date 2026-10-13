export type InterpretationTone = 'NEUTRAL' | 'CAUTION' | 'RISK';

/** Punto de corte de assessment.reference_range (RN-D10): dato con su fuente, nunca código. */
export interface ReferenceRange {
  readonly id: string;
  /** null: de la plataforma; si no, de la organización, que tiene prioridad. */
  readonly organizationId: string | null;
  readonly metricCode: string;
  readonly sex: 'M' | 'F' | null;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly population: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly label: string;
  readonly tone: InterpretationTone;
  readonly source: string;
}

export interface Interpretation {
  readonly label: string;
  readonly tone: InterpretationTone;
  readonly source: string;
}

export interface InterpretedSubject {
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
  readonly population: string;
}

/** Intervalos semiabiertos [mínimo, máximo): la tabla ACE tiene huecos entre sus bandas (ADR-044). */
const inside = (value: number, min: number | null, max: number | null): boolean =>
  (min === null || value >= min) && (max === null || value < max);

/**
 * Interpreta un valor sin redondear (RN-D09, RN-D10): el rango del indicador que corresponde al sexo, la edad y la
 * población; los de la organización antes que los de la plataforma, y el más específico primero.
 */
export function interpret(
  metricCode: string,
  value: number,
  subject: InterpretedSubject,
  ranges: readonly ReferenceRange[],
): Interpretation | null {
  const specificity = (range: ReferenceRange) =>
    (range.organizationId ? 8 : 0) +
    (range.population ? 4 : 0) +
    (range.sex ? 2 : 0) +
    (range.minAge !== null || range.maxAge !== null ? 1 : 0);
  const match = ranges
    .filter(
      (range) =>
        range.metricCode === metricCode &&
        (range.sex === null || range.sex === subject.sex) &&
        (range.population === null || range.population === subject.population) &&
        inside(subject.ageYears, range.minAge, range.maxAge) &&
        inside(value, range.minValue, range.maxValue),
    )
    .sort((a, b) => specificity(b) - specificity(a))[0];
  return match ? { label: match.label, tone: match.tone, source: match.source } : null;
}
