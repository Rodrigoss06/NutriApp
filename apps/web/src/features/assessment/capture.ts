import type { EvaluationResponse, MeasurementSite } from '@nutricoach/contracts';
import { CONSOLIDATE_ISAK, runMethod } from '@nutricoach/engine';
import { parseDecimal } from '@nutricoach/ui';

export interface AttemptPreview {
  /** Diferencia relativa entre la 1.ª y la 2.ª toma, en %; null con menos de dos. */
  readonly diffPct: number | null;
  readonly needsThird: boolean;
  /** Media de dos o mediana de tres; null mientras falte una toma. */
  readonly consolidated: number | null;
}

const NO_PREVIEW: AttemptPreview = { diffPct: null, needsThird: false, consolidated: null };

/**
 * Vista previa del motor mientras se escribe (RN-C02, RN-C03): la misma consolidación que hará la API, para avisar de
 * la tercera toma antes de guardar. Lo que queda y se muestra al final es lo que devuelve la API.
 */
export function previewAttempts(
  site: Pick<MeasurementSite, 'family'>,
  attempts: readonly number[],
): AttemptPreview {
  if (attempts.length < 2) return NO_PREVIEW;
  const run = runMethod(CONSOLIDATE_ISAK, {
    family: site.family === 'SKINFOLD' ? 'SKINFOLD' : 'OTHER',
    attempts: attempts.slice(0, 3),
  });
  if (!run.ok) return NO_PREVIEW;
  const { diffPct, needsThird, value } = run.result.outputs;
  return { diffPct, needsThird, consolidated: value };
}

/** Una toma se guarda con 2 decimales (numeric(7,2)): más precisión se rechaza en vez de redondearse. */
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** Por qué una toma no se puede guardar: fuera del rango del catálogo (RN-C04) o con más de 2 decimales. */
export function attemptError(
  site: Pick<MeasurementSite, 'minValue' | 'maxValue' | 'unit'>,
  value: number,
): string | null {
  if (value < site.minValue || value > site.maxValue) {
    return `Fuera del rango aceptado: de ${String(site.minValue)} a ${String(site.maxValue)} ${site.unit}.`;
  }
  if (!twoDecimals(value)) return 'Usa hasta 2 decimales.';
  return null;
}

export interface SiteGroup {
  readonly family: MeasurementSite['family'];
  readonly sites: readonly MeasurementSite[];
}

const FAMILY_ORDER: readonly MeasurementSite['family'][] = [
  'BASIC',
  'SKINFOLD',
  'GIRTH',
  'LENGTH',
  'BREADTH',
];

type CaptureState = Pick<EvaluationResponse, 'progress' | 'measurements'>;

const shownCodes = (evaluation: CaptureState, added: readonly string[]) =>
  new Set([
    ...evaluation.progress.requiredSites,
    ...evaluation.measurements.map((m) => m.siteCode),
    ...added,
  ]);

/**
 * Los sitios que se capturan: los que exige el nivel (progress.requiredSites), los extra que ya tienen tomas y los que
 * se acaban de agregar, por familia y en el orden del catálogo (RN-C01).
 */
export function captureGroups(
  sites: readonly MeasurementSite[],
  evaluation: CaptureState,
  added: readonly string[] = [],
): SiteGroup[] {
  const shown = shownCodes(evaluation, added);
  const ordered = sites
    .filter((site) => shown.has(site.code))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return FAMILY_ORDER.map((family) => ({
    family,
    sites: ordered.filter((site) => site.family === family),
  })).filter((group) => group.sites.length > 0);
}

/** Sitios del catálogo que se pueden agregar como extra: los que no están ya en la captura. */
export function extraSiteOptions(
  sites: readonly MeasurementSite[],
  evaluation: CaptureState,
  added: readonly string[] = [],
): MeasurementSite[] {
  const shown = shownCodes(evaluation, added);
  return sites
    .filter((site) => !shown.has(site.code))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Los pares de un estudio de ETM (RN-C05): dos tomas por línea, separadas por espacio, tabulación o punto y coma; la
 * coma vale como decimal. null si alguna línea no tiene exactamente dos números.
 */
export function parsePairs(text: string): [number, number][] | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const pairs: [number, number][] = [];
  for (const line of lines) {
    const values = line.split(/[\s;]+/).map((token) => parseDecimal(token));
    const [first, second] = values;
    if (values.length !== 2 || first === undefined || second === undefined) return null;
    if (first === null || second === null) return null;
    pairs.push([first, second]);
  }
  return pairs;
}
