import type { EvolutionSheetSource } from '../../../assessment/index.js';
import type { SheetPatient } from './sheet-content.js';

type Significance = 'CHANGE' | 'NO_SIGNIFICANT_CHANGE' | 'UNKNOWN';

/** Una serie de la ficha: cada punto con su fecha local y su cambio contra el anterior; del primero al último. */
export interface EvolutionSheetSeries {
  readonly points: readonly {
    /** YYYY-MM-DD, fecha local de la medición. */
    readonly measuredOn: string;
    readonly value: number;
    readonly change: number | null;
    readonly significance: Significance | null;
  }[];
  readonly overall: {
    readonly change: number;
    readonly mdc95: number | null;
    readonly significance: Significance | null;
  } | null;
}

/**
 * Ficha de evolución (RN-H01, ADR-091): las evaluaciones cerradas vigentes del paciente hasta la de origen, cada medida con su
 * cambio frente al CMD95 del evaluador (RN-C06), cada indicador por método (RN-D03, RN-H04) y la bioimpedancia por equipo
 * (RN-C08), con lo que cambió en las condiciones (RN-C09). Los códigos de métodos, indicadores y sitios los traduce la
 * plantilla.
 */
export interface EvolutionSheet {
  readonly kind: 'EVOLUTION';
  readonly patient: SheetPatient;
  readonly evaluations: readonly {
    readonly measuredOn: string;
    readonly conditionDifferences: readonly string[];
  }[];
  readonly sites: readonly (EvolutionSheetSeries & {
    readonly name: string;
    readonly family: string;
    readonly unit: string;
  })[];
  readonly skinfoldSum6: EvolutionSheetSeries | null;
  readonly metrics: readonly (EvolutionSheetSeries & {
    readonly metricCode: string;
    readonly methodCode: string;
    readonly unit: string;
  })[];
  readonly bia: readonly (EvolutionSheetSeries & {
    readonly device: string;
    readonly metric: string;
    readonly deviceLabel: string;
    readonly unit: string;
  })[];
}

type SourceSeries = EvolutionSheetSource['view']['skinfoldSum6'] & object;

const seriesOf = (series: SourceSeries): EvolutionSheetSeries => ({
  points: series.points.map((point) => ({
    measuredOn: point.localDate,
    value: point.value,
    change: point.change,
    significance: point.significance,
  })),
  overall: series.overall ? { ...series.overall } : null,
});

/**
 * La ficha desde la evolución hasta su origen. Un sitio medido una sola vez no tiene evolución y no entra; la ficha de
 * resultados ya lo muestra.
 */
export function evolutionSheet(
  source: EvolutionSheetSource,
  patient: SheetPatient,
): EvolutionSheet {
  const { view } = source;
  const moved = <T extends SourceSeries>(series: readonly T[]) =>
    series.filter((entry) => entry.points.length > 1);
  return {
    kind: 'EVOLUTION',
    patient,
    evaluations: view.evaluations.map((evaluation) => ({
      measuredOn: evaluation.localDate,
      conditionDifferences: [...evaluation.conditionDifferences],
    })),
    sites: moved(view.sites).map((site) => ({
      name: site.name,
      family: site.family,
      unit: site.unit,
      ...seriesOf(site),
    })),
    skinfoldSum6: view.skinfoldSum6 ? seriesOf(view.skinfoldSum6) : null,
    metrics: moved(view.metrics).map((metric) => ({
      metricCode: metric.metricCode,
      methodCode: metric.methodCode,
      unit: metric.unit,
      ...seriesOf(metric),
    })),
    bia: moved(view.bia).map((reading) => ({
      device: reading.device,
      metric: reading.metric,
      deviceLabel: reading.deviceLabel,
      unit: reading.unit,
      ...seriesOf(reading),
    })),
  };
}
