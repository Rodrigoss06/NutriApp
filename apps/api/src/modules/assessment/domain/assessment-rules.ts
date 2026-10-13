import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type SiteFamily = 'BASIC' | 'SKINFOLD' | 'GIRTH' | 'LENGTH' | 'BREADTH';
export type SiteUnit = 'kg' | 'cm' | 'mm';
export type EvaluationLevel = 'BASIC' | 'ISAK1' | 'ISAK2';
export type EvaluationKind = 'ANTHROPOMETRY' | 'BIA' | 'MIXED';
export type EvaluationStatus = 'DRAFT' | 'CLOSED' | 'AMENDED';
export type MeasurementSide = 'RIGHT' | 'LEFT';
export type ConsolidationMethod = 'SINGLE' | 'MEAN_2' | 'MEDIAN_3';

/** Sitio del catálogo global (assessment.measurement_site): los rangos y los niveles son datos (ADR-014). */
export interface SiteDefinition {
  readonly code: string;
  readonly family: SiteFamily;
  readonly nameEs: string;
  readonly unit: SiteUnit;
  readonly minValue: number;
  readonly maxValue: number;
  readonly tolerancePct: number;
  readonly minAttempts: number;
  readonly levels: readonly EvaluationLevel[];
  readonly displayOrder: number;
}

/**
 * Lo que dice el motor de unas tomas (CONSOLIDATE_ISAK, RN-C02 y RN-C03). La calcula application; el dominio decide
 * con ella (02 §4: domain no invoca al motor).
 */
export interface Consolidation {
  /** null mientras falte una toma o la tercera. */
  readonly value: number | null;
  /** Diferencia relativa entre la 1.ª y la 2.ª toma; null con una sola. */
  readonly diffPct: number | null;
  readonly needsThird: boolean;
  readonly method: ConsolidationMethod | null;
}

/** Condiciones v1 de la evaluación (RN-C09, ⚠️ ADR-044). */
export interface EvaluationConditions {
  readonly schemaVersion: 1;
  readonly fasting: boolean;
  readonly intenseActivityLast24h: boolean;
  readonly hydration: string | null;
}

export const EVALUATION_NOT_FOUND = domainError({
  code: 'NC-ASM-001',
  message: 'No encontramos esa evaluación.',
});
export const SITE_NOT_FOUND = (siteCode: string): DomainError =>
  domainError({
    code: 'NC-ASM-002',
    message: `El sitio «${siteCode}» no está en el catálogo.`,
    details: { siteCode },
  });
export const MEASUREMENT_OUT_OF_RANGE = (site: SiteDefinition, value: number): DomainError =>
  domainError({
    code: 'NC-ASM-003',
    rule: 'RN-C04',
    message: `${site.nameEs}: ${value} ${site.unit} está fuera del rango aceptado (${site.minValue} a ${site.maxValue} ${site.unit}).`,
    details: { siteCode: site.code, value, minValue: site.minValue, maxValue: site.maxValue },
  });
export const THIRD_ATTEMPT_REQUIRED = (siteCodes: readonly string[]): DomainError =>
  domainError({
    code: 'NC-ASM-004',
    rule: 'RN-C02',
    message:
      'Se necesita una tercera toma: la diferencia entre las dos primeras supera la tolerancia.',
    details: { siteCodes },
  });
export const THIRD_ATTEMPT_NOT_NEEDED = (site: SiteDefinition): DomainError =>
  domainError({
    code: 'NC-ASM-005',
    rule: 'RN-C02',
    message: `${site.nameEs}: las dos primeras tomas están dentro de la tolerancia; no hace falta una tercera.`,
    details: { siteCode: site.code },
  });
export const REQUIRED_SITES_MISSING = (siteCodes: readonly string[]): DomainError =>
  domainError({
    code: 'NC-ASM-006',
    rule: 'RN-C01',
    message: 'Faltan sitios del nivel por medir o consolidar.',
    details: { siteCodes },
  });
export const EVALUATION_NOT_DRAFT = domainError({
  code: 'NC-ASM-007',
  rule: 'RN-C07',
  message: 'Una evaluación cerrada no se edita: se enmienda con una revisión.',
});
export const EVALUATION_VERSION_CONFLICT = domainError({
  code: 'NC-ASM-008',
  message: 'Alguien cambió esta evaluación mientras la editabas. Carga la versión actual.',
});
export const AMEND_ONLY_CLOSED = domainError({
  code: 'NC-ASM-009',
  rule: 'RN-C07',
  message: 'Solo se enmienda una evaluación cerrada que no tenga otra revisión.',
});
export const BIA_NOT_ALLOWED = domainError({
  code: 'NC-ASM-011',
  rule: 'RN-C08',
  message: 'La bioimpedancia va en una evaluación de bioimpedancia o mixta.',
});
export const BIA_REQUIRED = domainError({
  code: 'NC-ASM-012',
  rule: 'RN-C08',
  message: 'Carga la lectura del bioimpedanciómetro antes de cerrar.',
});
export const BIA_READING_NOT_FOUND = domainError({
  code: 'NC-ASM-013',
  message: 'No encontramos esa lectura de bioimpedancia.',
});
export const EVALUATOR_NOT_MEMBER = domainError({
  code: 'NC-ASM-014',
  rule: 'RN-C09',
  message: 'El evaluador debe ser un miembro activo de la organización.',
});
export const TECHNICAL_ERROR_FORBIDDEN = domainError({
  code: 'NC-ASM-015',
  message: 'Solo el propio evaluador, el dueño o un administrador registran su ETM.',
});
export const TECHNICAL_ERROR_INVALID = (siteCode: string): DomainError =>
  domainError({
    code: 'NC-ASM-016',
    rule: 'RN-C05',
    message: 'El ETM necesita pares de tomas con una media mayor que cero.',
    details: { siteCode },
  });

export const RECALCULATE_ONLY_CLOSED = domainError({
  code: 'NC-ASM-018',
  rule: 'RN-D08',
  message: 'Solo se recalcula una evaluación cerrada vigente; una enmendada queda como histórico.',
});
export const INVALID_PREFERENCE = domainError({
  code: 'NC-ASM-019',
  rule: 'RN-D05',
  message: 'Ese método no se puede elegir para ese propósito o esa población.',
});

/** Sitios que exige el nivel (RN-C01); una evaluación de bioimpedancia sin nivel no exige ninguno. */
export function requiredSiteCodes(
  level: EvaluationLevel | null,
  sites: readonly SiteDefinition[],
): string[] {
  if (!level) return [];
  return sites
    .filter((site) => site.levels.includes(level))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ code }) => code);
}

/**
 * Tomas de un sitio (RN-C02, RN-C04): cada una dentro del rango del catálogo y, si son tres, la tercera solo cuando
 * las dos primeras se alejan más que la tolerancia. `firstTwo` es lo que dice el motor de las dos primeras.
 */
export function checkAttempts(
  site: SiteDefinition,
  attempts: readonly number[],
  firstTwo: Consolidation | null,
): DomainError | null {
  const outside = attempts.find((value) => value < site.minValue || value > site.maxValue);
  if (outside !== undefined) return MEASUREMENT_OUT_OF_RANGE(site, outside);
  if (attempts.length === 3 && !firstTwo?.needsThird) return THIRD_ATTEMPT_NOT_NEEDED(site);
  return null;
}

export interface MeasuredSite {
  readonly siteCode: string;
  readonly consolidation: Consolidation;
}

export interface EvaluationProgress {
  readonly requiredSites: readonly string[];
  /** Exigidos sin medir, o medidos (también los extra) sin consolidar que no esperan una tercera toma. */
  readonly missingSites: readonly string[];
  readonly needsThirdSites: readonly string[];
  readonly canClose: boolean;
}

/** Qué falta para cerrar (02 §7): todos los sitios del nivel consolidados y ninguna tercera toma pendiente. */
export function progressOf(
  evaluation: { readonly kind: EvaluationKind; readonly level: EvaluationLevel | null },
  sites: readonly SiteDefinition[],
  measured: readonly MeasuredSite[],
  biaReadings: number,
): EvaluationProgress {
  const requiredSites = requiredSiteCodes(evaluation.level, sites);
  const bySite = new Map(measured.map((m) => [m.siteCode, m.consolidation]));
  const order = new Map(sites.map((site) => [site.code, site.displayOrder]));
  const sorted = (codes: Iterable<string>) =>
    [...codes].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const needsThirdSites = sorted(
    measured.filter((m) => m.consolidation.needsThird).map(({ siteCode }) => siteCode),
  );
  const missingSites = sorted(
    new Set([
      ...requiredSites.filter((code) => !bySite.has(code)),
      ...measured
        .filter((m) => m.consolidation.value === null && !m.consolidation.needsThird)
        .map(({ siteCode }) => siteCode),
    ]),
  );
  const biaOk = evaluation.kind === 'ANTHROPOMETRY' || biaReadings > 0;
  return {
    requiredSites,
    missingSites,
    needsThirdSites,
    canClose: missingSites.length === 0 && needsThirdSites.length === 0 && biaOk,
  };
}

/** Por qué no se puede cerrar todavía, en el orden en que se corrige; null si se puede. */
export function closeError(
  evaluation: { readonly kind: EvaluationKind },
  progress: EvaluationProgress,
  biaReadings: number,
): DomainError | null {
  if (progress.needsThirdSites.length > 0) return THIRD_ATTEMPT_REQUIRED(progress.needsThirdSites);
  if (progress.missingSites.length > 0) return REQUIRED_SITES_MISSING(progress.missingSites);
  if (evaluation.kind !== 'ANTHROPOMETRY' && biaReadings === 0) return BIA_REQUIRED;
  return null;
}

/** Bioimpedancia solo en evaluaciones de bioimpedancia o mixtas (RN-C08). */
export const acceptsBia = (kind: EvaluationKind): boolean => kind !== 'ANTHROPOMETRY';

const parseDate = (value: string): [number, number, number] => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = value.split('-').map(Number);
  return [year, month, day];
};

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const daysInMonth = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 31);

/** Días desde el 1970-01-01 de una fecha civil; el 29 de febrero cae el 28 en años no bisiestos. */
function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))) / 86_400_000;
}

/**
 * Edad decimal en una fecha (ADR-044): años cumplidos más la fracción del año en curso, contada entre el último
 * cumpleaños y el siguiente. El día del cumpleaños es exacta: 28.00.
 */
export function decimalAgeYears(birthDate: string, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = parseDate(birthDate);
  const [year, month, day] = parseDate(onDate);
  const today = dayNumber(year, month, day);
  let completed = year - birthYear;
  if (dayNumber(year, birthMonth, birthDay) > today) completed -= 1;
  const last = dayNumber(birthYear + completed, birthMonth, birthDay);
  const next = dayNumber(birthYear + completed + 1, birthMonth, birthDay);
  return completed + (today - last) / (next - last);
}

/** Un miembro registra su propio ETM; el dueño y los administradores, el de cualquiera (RN-C05). */
export function canRecordTechnicalError(
  actor: { readonly role: string; readonly memberId: string | null },
  memberId: string,
): boolean {
  return actor.memberId === memberId || actor.role === 'OWNER' || actor.role === 'ADMIN';
}

/** Pares de un estudio de ETM: dentro del rango del sitio y con media mayor que cero (RN-C04, RN-C05). */
export function checkTechnicalErrorPairs(
  site: SiteDefinition,
  pairs: readonly (readonly [number, number])[],
): DomainError | null {
  const values = pairs.flat();
  const outside = values.find((value) => value < site.minValue || value > site.maxValue);
  if (outside !== undefined) return MEASUREMENT_OUT_OF_RANGE(site, outside);
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? null : TECHNICAL_ERROR_INVALID(site.code);
}
