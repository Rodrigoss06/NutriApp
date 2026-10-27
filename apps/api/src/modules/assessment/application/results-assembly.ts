import { Inject, Injectable } from '@nestjs/common';
import type { MethodCode } from '@nutricoach/engine';
import type { SiteUnit } from '../domain/assessment-rules.js';
import type { MethodPurpose } from '../domain/calculation-plan.js';
import {
  interpret,
  interpretationNote,
  rangesInForce,
  referenceScale,
  type Interpretation,
  type ReferenceRange,
  type ReferenceScale,
} from '../domain/interpretation.js';
import { CalculationService, shownResults } from './calculation.service.js';
import type { UnavailableMethod } from './calculation.js';
import { consolidate } from './data-quality.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  SITE_CATALOG,
  type CalculationStore,
  type EvaluationRecord,
  type EvaluationStore,
  type SiteCatalog,
  type StoredResult,
} from './ports/assessment.ports.js';
import { metricsOf, type MetricValue } from './result-metrics.js';

export interface InterpretedMetric extends MetricValue {
  readonly interpretation: Interpretation | null;
  /** Por qué no hay interpretación cuando el indicador tiene rangos: en menores, el aviso de RN-D05. */
  readonly interpretationNote: string | null;
  /** La tabla completa de la interpretación, para mostrar dónde cae el valor (RN-D10). */
  readonly referenceScale: ReferenceScale | null;
}

export interface ResultView extends StoredResult {
  readonly metrics: readonly InterpretedMetric[];
  readonly principalFor: readonly MethodPurpose[];
}

export interface SiteInterpretationView {
  readonly siteCode: string;
  readonly value: number;
  readonly unit: SiteUnit;
  readonly interpretation: Interpretation | null;
  readonly interpretationNote: string | null;
  readonly referenceScale: ReferenceScale | null;
}

export interface ResultsView {
  readonly evaluationId: string;
  readonly status: 'PENDING' | 'READY';
  readonly results: readonly ResultView[];
  readonly unavailable: readonly UnavailableMethod[];
  readonly populationNote: string | null;
  readonly siteInterpretations: readonly SiteInterpretationView[];
}
/**
 * Los resultados de una evaluación como se muestran (RF-15): cada número con su método (RN-D02) y su interpretación con
 * fuente sobre el valor sin redondear, con los rangos vigentes en su fecha (RN-D10); lo que no se calculó, con su motivo
 * (RN-D04 a RN-D06). Los usan la pantalla de resultados y la ficha PDF (ADR-064), en la transacción de quien llama y sin
 * auditar: audita quien entrega los datos (RN-B03).
 */
@Injectable()
export class ResultsAssembly {
  constructor(
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(CalculationService) private readonly calculation: CalculationService,
  ) {}

  async of(evaluation: EvaluationRecord): Promise<ResultsView> {
    const shown = shownResults(evaluation, await this.calculations.results([evaluation.id]));
    // Los rangos de la fecha de la evaluación: una versión nueva no cambia lo ya medido (RN-D10, ADR-048).
    const ranges = rangesInForce(await this.calculations.referenceRanges(), evaluation.localDate);
    const outcome =
      evaluation.status === 'DRAFT' ? null : await this.calculation.outcomeOf(evaluation);
    const subject = evaluation.patientSnapshot;
    const results = shown.map((result) => ({
      ...result,
      metrics: metricsOf(result.methodCode, result.outputs, result.inputs).map((metric) => {
        const interpretation = interpret(metric.metricCode, metric.value, subject, ranges);
        return {
          ...metric,
          interpretation,
          interpretationNote: interpretation
            ? null
            : interpretationNote(metric.metricCode, subject, ranges),
          referenceScale: referenceScale(metric.metricCode, metric.value, subject, ranges),
        };
      }),
      principalFor: outcome?.principal.get(result.methodCode as MethodCode) ?? [],
    }));
    const computed = new Set(shown.map((r) => r.methodCode));
    return {
      evaluationId: evaluation.id,
      status: evaluation.status === 'DRAFT' || results.length === 0 ? 'PENDING' : 'READY',
      results,
      unavailable: (outcome?.unavailable ?? []).filter((u) => !computed.has(u.methodCode)),
      populationNote: outcome?.populationNote ?? null,
      siteInterpretations: await this.#siteInterpretations(evaluation, ranges),
    };
  }

  async #siteInterpretations(
    evaluation: EvaluationRecord,
    ranges: readonly ReferenceRange[],
  ): Promise<SiteInterpretationView[]> {
    const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
    const views: SiteInterpretationView[] = [];
    for (const m of await this.evaluations.measurements(evaluation.id)) {
      const site = sites.get(m.siteCode);
      if (!site || !ranges.some((r) => r.metricCode === m.siteCode)) continue;
      const value = consolidate(site, m.attempts).value;
      if (value === null) continue;
      const subject = evaluation.patientSnapshot;
      const interpretation = interpret(m.siteCode, value, subject, ranges);
      const note = interpretation ? null : interpretationNote(m.siteCode, subject, ranges);
      if (interpretation || note) {
        views.push({
          siteCode: m.siteCode,
          value,
          unit: site.unit,
          interpretation,
          interpretationNote: note,
          referenceScale: referenceScale(m.siteCode, value, subject, ranges),
        });
      }
    }
    return views;
  }
}
