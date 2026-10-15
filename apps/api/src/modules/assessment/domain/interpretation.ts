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
  /** Versión (YYYY-MM-DD): las filas de un indicador y un alcance que rigen desde esa fecha. */
  readonly validFrom: string;
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

/** RN-D05: en menores, el valor se muestra con su método y este aviso, sin interpretación. */
export const PEDIATRIC_NOTE = 'Sin interpretación pediátrica en la versión 1.0';

/**
 * Los rangos que rigen en una fecha (RN-D10, ADR-048): por indicador y alcance (plataforma u organización), la versión
 * con el valid_from más reciente que no pase de esa fecha. Una versión trae todas las filas de su indicador. Lo de una
 * organización rige desde su versión; antes, el de la plataforma. Antes de la primera versión de la plataforma rige esa
 * primera: no hubo otra.
 */
export function rangesInForce(ranges: readonly ReferenceRange[], onDate: string): ReferenceRange[] {
  const scopeOf = (range: ReferenceRange) => `${range.organizationId ?? ''}|${range.metricCode}`;
  const versions = new Map<string, string[]>();
  for (const range of ranges) {
    const dates = versions.get(scopeOf(range)) ?? [];
    if (!dates.includes(range.validFrom)) dates.push(range.validFrom);
    versions.set(scopeOf(range), dates);
  }
  const chosen = new Map<string, string>();
  for (const [scope, dates] of versions) {
    const sorted = [...dates].sort();
    const inForce = sorted.filter((date) => date <= onDate).at(-1);
    const platform = scope.startsWith('|');
    const version = inForce ?? (platform ? sorted[0] : undefined);
    if (version) chosen.set(scope, version);
  }
  return ranges.filter((range) => chosen.get(scopeOf(range)) === range.validFrom);
}

/** Intervalos semiabiertos [mínimo, máximo): la tabla ACE tiene huecos entre sus bandas (ADR-044). */
const inside = (value: number, min: number | null, max: number | null): boolean =>
  (min === null || value >= min) && (max === null || value < max);

/**
 * Interpreta un valor sin redondear (RN-D09, RN-D10) con los rangos que rigen: el del indicador que corresponde al sexo,
 * la edad y la población; los de la organización antes que los de la plataforma, y el más específico primero.
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

/**
 * Por qué un indicador con rangos no tiene interpretación (RN-D05): el paciente es menor que la edad desde la que
 * rigen todos los rangos de su sexo y su población, que hoy es 18 años. null si no hay rangos para él o si alguno
 * cubre su edad.
 */
export function interpretationNote(
  metricCode: string,
  subject: InterpretedSubject,
  ranges: readonly ReferenceRange[],
): string | null {
  const applicable = ranges.filter(
    (range) =>
      range.metricCode === metricCode &&
      (range.sex === null || range.sex === subject.sex) &&
      (range.population === null || range.population === subject.population),
  );
  const tooYoung =
    applicable.length > 0 &&
    applicable.every((range) => range.minAge !== null && subject.ageYears < range.minAge);
  return tooYoung ? PEDIATRIC_NOTE : null;
}
