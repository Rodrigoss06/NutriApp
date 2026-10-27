import type { EvaluationSheet } from '../../../assessment/index.js';
import type { SheetPatient } from './sheet-content.js';

export interface SheetInterpretation {
  readonly label: string;
  readonly tone: 'NEUTRAL' | 'CAUTION' | 'RISK';
  readonly source: string;
}

/**
 * Ficha de resultados antropométricos (RF-15, RN-H01): las condiciones de la evaluación (RN-C09), las medidas
 * consolidadas (RN-C03), cada resultado vigente con su método y versión (RN-D02, RN-H04) y su interpretación con fuente
 * (RN-D10), los avisos de validez (RN-D06) y la bioimpedancia como lectura del equipo (RN-C08). Los códigos de métodos,
 * indicadores y sitios los traduce la plantilla.
 */
export interface AnthropometrySheet {
  readonly kind: 'ANTHROPOMETRY';
  readonly patient: SheetPatient;
  readonly evaluation: {
    readonly kind: 'ANTHROPOMETRY' | 'BIA' | 'MIXED';
    readonly level: 'BASIC' | 'ISAK1' | 'ISAK2' | null;
    /** YYYY-MM-DD, fecha local de la medición. */
    readonly measuredOn: string;
    readonly revision: number;
    readonly amended: boolean;
    readonly fasting: boolean;
    readonly intenseActivityLast24h: boolean;
    readonly hydration: string | null;
  };
  readonly sites: readonly {
    readonly family: string;
    readonly name: string;
    readonly unit: string;
    readonly value: number;
  }[];
  readonly results: readonly {
    readonly methodCode: string;
    readonly methodVersion: string;
    readonly engineVersion: string;
    /** Para qué es el método principal del paciente: «% de grasa», «masa muscular» (RN-D05). */
    readonly principalFor: readonly string[];
    readonly metrics: readonly {
      readonly metricCode: string;
      /** El método de este número; en 4 componentes, el de cada masa (RN-D02). */
      readonly methodCode: string;
      readonly value: number;
      readonly unit: string;
      readonly interpretation: SheetInterpretation | null;
      readonly note: string | null;
    }[];
    readonly warnings: readonly { readonly severity: string; readonly message: string }[];
  }[];
  /** Medidas que tienen interpretación propia, como la cintura (RN-D10). */
  readonly siteInterpretations: readonly {
    readonly name: string;
    readonly value: number;
    readonly unit: string;
    readonly interpretation: SheetInterpretation | null;
    readonly note: string | null;
  }[];
  readonly bia: EvaluationSheet['bia'];
  /** En menores de 18, el aviso de RN-D05: sin interpretación pediátrica en la versión 1.0. */
  readonly populationNote: string | null;
}

const interpretationOf = (
  value: { label: string; tone: SheetInterpretation['tone']; source: string } | null,
): SheetInterpretation | null =>
  value ? { label: value.label, tone: value.tone, source: value.source } : null;

/** La ficha de una evaluación cerrada con sus resultados vigentes. */
export function anthropometrySheet(
  data: EvaluationSheet,
  patient: SheetPatient,
): AnthropometrySheet {
  const { evaluation, results } = data;
  const siteNames = new Map(data.sites.map((site) => [site.code, site.name]));
  return {
    kind: 'ANTHROPOMETRY',
    patient,
    evaluation: {
      kind: evaluation.kind,
      level: evaluation.level,
      measuredOn: evaluation.localDate,
      revision: evaluation.revision,
      amended: evaluation.status === 'AMENDED',
      fasting: evaluation.conditions.fasting,
      intenseActivityLast24h: evaluation.conditions.intenseActivityLast24h,
      hydration: evaluation.conditions.hydration,
    },
    sites: data.sites.map(({ family, name, unit, value }) => ({ family, name, unit, value })),
    results: results.results.map((result) => ({
      methodCode: result.methodCode,
      methodVersion: result.methodVersion,
      engineVersion: result.engineVersion,
      principalFor: result.principalFor,
      metrics: result.metrics.map((metric) => ({
        metricCode: metric.metricCode,
        methodCode: metric.methodCode,
        value: metric.value,
        unit: metric.unit,
        interpretation: interpretationOf(metric.interpretation),
        note: metric.interpretationNote,
      })),
      warnings: result.warnings.map(({ severity, message }) => ({ severity, message })),
    })),
    siteInterpretations: results.siteInterpretations.map((site) => ({
      name: siteNames.get(site.siteCode) ?? site.siteCode,
      value: site.value,
      unit: site.unit,
      interpretation: interpretationOf(site.interpretation),
      note: site.interpretationNote,
    })),
    bia: data.bia,
    populationNote: results.populationNote,
  };
}
