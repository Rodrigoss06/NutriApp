import { Inject, Injectable } from '@nestjs/common';
import {
  METHODS_BY_POPULATION,
  runMethod,
  TARGET_WEIGHT_FAT_PCT,
  type Issue,
  type Kg,
  type MethodCode,
  type Population,
} from '@nutricoach/engine';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import {
  effectivePreferences,
  type EffectivePreference,
  type MethodPurpose,
} from '../../domain/calculation-plan.js';
import {
  conditionDifferences,
  significance,
  SKINFOLD_SUM6_SITES,
  type ConditionDifference,
  type Significance,
} from '../../domain/comparison.js';
import {
  interpret,
  type Interpretation,
  type ReferenceRange,
} from '../../domain/interpretation.js';
import type { SiteUnit } from '../../domain/assessment-rules.js';
import { CalculationService, shownResults } from '../calculation.service.js';
import type { UnavailableMethod } from '../calculation.js';
import { consolidate, mdc95, technicalError } from '../data-quality.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
  type CalculationStore,
  type EvaluationRecord,
  type EvaluationStore,
  type SiteCatalog,
  type StoredResult,
  type TechnicalErrorStore,
} from '../ports/assessment.ports.js';
import { metricsOf, type MetricValue } from '../result-metrics.js';

export interface InterpretedMetric extends MetricValue {
  readonly interpretation: Interpretation | null;
}

export interface ResultView extends StoredResult {
  readonly metrics: readonly InterpretedMetric[];
  readonly principalFor: readonly MethodPurpose[];
}

export interface SiteInterpretationView {
  readonly siteCode: string;
  readonly value: number;
  readonly unit: SiteUnit;
  readonly interpretation: Interpretation;
}

export interface ResultsView {
  readonly evaluationId: string;
  readonly status: 'PENDING' | 'READY';
  readonly results: readonly ResultView[];
  readonly unavailable: readonly UnavailableMethod[];
  readonly populationNote: string | null;
  readonly siteInterpretations: readonly SiteInterpretationView[];
}

export interface SiteComparison {
  readonly siteCode: string;
  readonly unit: SiteUnit;
  readonly previous: number;
  readonly current: number;
  readonly delta: number;
  readonly mdc95: number | null;
  readonly significance: Significance;
}

export interface ComparisonView {
  readonly current: EvaluationRecord;
  readonly previous: EvaluationRecord | null;
  readonly conditionDifferences: readonly ConditionDifference[];
  readonly sites: readonly SiteComparison[];
  readonly skinfoldSum6: {
    readonly previous: number;
    readonly current: number;
    readonly delta: number;
    readonly temRelPct: number | null;
    readonly mdc95: number | null;
    readonly significance: Significance;
  } | null;
  readonly metrics: readonly {
    readonly methodCode: string;
    readonly metricCode: string;
    readonly unit: string;
    readonly previous: number;
    readonly current: number;
    readonly delta: number;
  }[];
}

export interface TargetWeightView {
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly weightKg: number;
  readonly fatFreeMassKg: number;
  readonly fatFreeMassMethodCode: string;
  readonly targetFatPct: number;
  readonly targetWeightKg: number;
  readonly weightChangeKg: number;
  readonly warnings: readonly Issue[];
}

export type PreferencesView = Readonly<Record<MethodPurpose, EffectivePreference>>;

const minutesOfDay = (instant: Date, timeZone: string): number => {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(instant)
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
};

/**
 * Resultados (RF-15): cada número con su método (RN-D02) y su interpretación con fuente sobre el valor sin redondear
 * (RN-D10); lo que no se calculó, con su motivo (RN-D04 a RN-D06). La comparación usa el CMD95 del evaluador (RN-C06)
 * y nunca mezcla métodos (RN-D03). Cada lectura deja un READ (RN-B03).
 */
@Injectable()
export class ResultsQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(TECHNICAL_ERROR_STORE) private readonly errors: TechnicalErrorStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(CalculationService) private readonly calculation: CalculationService,
  ) {}

  async results(context: SecurityContext, evaluationId: string): Promise<ResultsView | null> {
    const view = await this.uow.query(context, async () => {
      const evaluation = await this.evaluations.find(evaluationId);
      if (!evaluation) return null;
      const shown = shownResults(evaluation, await this.calculations.results([evaluationId]));
      const ranges = await this.calculations.referenceRanges();
      const outcome =
        evaluation.status === 'DRAFT' ? null : await this.calculation.outcomeOf(evaluation);
      const subject = evaluation.patientSnapshot;
      const results = shown.map((result) => ({
        ...result,
        metrics: metricsOf(result.methodCode, result.outputs, result.inputs).map((metric) => ({
          ...metric,
          interpretation: interpret(metric.metricCode, metric.value, subject, ranges),
        })),
        principalFor: outcome?.principal.get(result.methodCode as MethodCode) ?? [],
      }));
      const computed = new Set(shown.map((r) => r.methodCode));
      return {
        evaluation,
        view: {
          evaluationId,
          status: evaluation.status === 'DRAFT' || results.length === 0 ? 'PENDING' : 'READY',
          results,
          unavailable: (outcome?.unavailable ?? []).filter((u) => !computed.has(u.methodCode)),
          populationNote: outcome?.populationNote ?? null,
          siteInterpretations: await this.#siteInterpretations(evaluation, ranges),
        } satisfies ResultsView,
      };
    });
    if (!view) return null;
    await this.#audited(context, evaluationId, view.evaluation.patientId);
    return view.view;
  }

  /**
   * Contra otra evaluación cerrada del paciente; por defecto, la anterior vigente. Deltas = actual − anterior. El
   * CMD95 es el del evaluador de la actual en su fecha; sobre la suma de 6 pliegues, con el %ETM agrupado (G-04).
   */
  async comparison(
    context: SecurityContext,
    evaluationId: string,
    otherId: string | undefined,
  ): Promise<ComparisonView | null> {
    const view = await this.uow.query(context, async () => {
      const current = await this.evaluations.find(evaluationId);
      if (!current || current.status === 'DRAFT') return null;
      const previous = otherId
        ? await this.evaluations.find(otherId)
        : ((await this.evaluations.listByPatient(current.patientId)).find(
            (e) =>
              e.id !== current.id &&
              e.status === 'CLOSED' &&
              e.measuredAt.getTime() < current.measuredAt.getTime(),
          ) ?? null);
      if (previous && (previous.patientId !== current.patientId || previous.status === 'DRAFT')) {
        return null;
      }
      return this.#compare(current, previous);
    });
    if (!view) return null;
    await this.#audited(context, evaluationId, view.current.patientId);
    return view;
  }

  /** Peso objetivo con la masa libre de grasa del método principal de % de grasa (RN-E06, G-12). */
  async targetWeight(
    context: SecurityContext,
    evaluationId: string,
    targetFatPct: number,
  ): Promise<TargetWeightView | 'NO_FAT_FREE_MASS' | null> {
    const view = await this.uow.query(context, async () => {
      const evaluation = await this.evaluations.find(evaluationId);
      if (!evaluation || evaluation.status === 'DRAFT') return null;
      const shown = shownResults(evaluation, await this.calculations.results([evaluationId]));
      const outcome = await this.calculation.outcomeOf(evaluation);
      const principal = shown.find((r) =>
        outcome.principal.get(r.methodCode as MethodCode)?.includes('FAT_PCT'),
      );
      const fatFreeMassKg = principal?.outputs.fatFreeMassKg;
      const weightKg = principal?.inputs.weightKg;
      if (!principal || typeof fatFreeMassKg !== 'number' || typeof weightKg !== 'number') {
        return { evaluation, view: 'NO_FAT_FREE_MASS' as const };
      }
      const run = runMethod(TARGET_WEIGHT_FAT_PCT, {
        weightKg: weightKg as Kg,
        fatFreeMassKg: fatFreeMassKg as Kg,
        fatFreeMassMethodCode: principal.methodCode as MethodCode,
        targetFatPct,
      });
      if (!run.ok) return { evaluation, view: 'NO_FAT_FREE_MASS' as const };
      return {
        evaluation,
        view: {
          methodVersion: run.result.methodVersion,
          engineVersion: run.result.engineVersion,
          weightKg,
          fatFreeMassKg,
          fatFreeMassMethodCode: principal.methodCode,
          targetFatPct,
          targetWeightKg: run.result.outputs.targetWeightKg,
          weightChangeKg: run.result.outputs.weightChangeKg,
          warnings: run.result.warnings,
        },
      };
    });
    if (!view) return null;
    await this.#audited(context, evaluationId, view.evaluation.patientId);
    return view.view;
  }

  /** Lo vigente para el paciente: su elección, la de su organización para su población o la plataforma. */
  async patientPreferences(
    context: SecurityContext,
    patientId: string,
  ): Promise<{ population: Population; preferences: PreferencesView } | null> {
    return this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return null;
      const population = patient.population;
      return {
        population,
        preferences: effectivePreferences(
          population,
          METHODS_BY_POPULATION[population],
          await this.calculations.preferenceRows(patientId),
        ),
      };
    });
  }

  /** La tabla vigente de la organización por población (RN-D05, RF-16). */
  async organizationPreferences(
    context: SecurityContext,
  ): Promise<readonly { population: Population; preferences: PreferencesView }[]> {
    return this.uow.query(context, async () => {
      const rows = (await this.calculations.preferenceRows(null)).filter(
        (r) => r.organizationLevel,
      );
      return (Object.keys(METHODS_BY_POPULATION) as Population[]).map((population) => ({
        population,
        preferences: effectivePreferences(population, METHODS_BY_POPULATION[population], rows),
      }));
    });
  }

  async #compare(
    current: EvaluationRecord,
    previous: EvaluationRecord | null,
  ): Promise<ComparisonView> {
    if (!previous) {
      return {
        current,
        previous,
        conditionDifferences: [],
        sites: [],
        skinfoldSum6: null,
        metrics: [],
      };
    }
    const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
    const valuesOf = async (evaluation: EvaluationRecord) => {
      const values = new Map<string, number>();
      for (const m of await this.evaluations.measurements(evaluation.id)) {
        const site = sites.get(m.siteCode);
        const value = site ? consolidate(site, m.attempts).value : null;
        if (value !== null) values.set(m.siteCode, value);
      }
      return values;
    };
    const now = await valuesOf(current);
    const before = await valuesOf(previous);
    const errors = new Map(
      (await this.errors.current(current.evaluatorMemberId, current.localDate)).map((row) => [
        row.siteCode,
        row,
      ]),
    );
    const temOf = (siteCode: string): number | null => {
      const row = errors.get(siteCode);
      if (!row) return null;
      return row.pairs ? (technicalError(row.pairs)?.temAbs ?? row.temAbs) : row.temAbs;
    };
    const comparedSites: SiteComparison[] = [...now]
      .filter(([siteCode]) => before.has(siteCode))
      .sort(([a], [b]) => (sites.get(a)?.displayOrder ?? 0) - (sites.get(b)?.displayOrder ?? 0))
      .map(([siteCode, value]) => {
        const delta = value - (before.get(siteCode) ?? value);
        const tem = temOf(siteCode);
        const minimal = tem === null ? null : mdc95(tem);
        return {
          siteCode,
          unit: sites.get(siteCode)?.unit ?? 'mm',
          previous: before.get(siteCode) ?? value,
          current: value,
          delta,
          mdc95: minimal,
          significance: significance(delta, minimal),
        };
      });
    const sum = (values: ReadonlyMap<string, number>) =>
      SKINFOLD_SUM6_SITES.every((code) => values.has(code))
        ? SKINFOLD_SUM6_SITES.reduce((total, code) => total + (values.get(code) ?? 0), 0)
        : null;
    const currentSum = sum(now);
    const previousSum = sum(before);
    let skinfoldSum6: ComparisonView['skinfoldSum6'] = null;
    if (currentSum !== null && previousSum !== null) {
      const pairs = SKINFOLD_SUM6_SITES.map((code) => errors.get(code)?.pairs ?? null);
      const pooled = pairs.every((p) => p !== null) ? technicalError(pairs.flat()) : null;
      const minimal = pooled ? mdc95((pooled.temRelPct / 100) * currentSum) : null;
      const delta = currentSum - previousSum;
      skinfoldSum6 = {
        previous: previousSum,
        current: currentSum,
        delta,
        temRelPct: pooled?.temRelPct ?? null,
        mdc95: minimal,
        significance: significance(delta, minimal),
      };
    }
    const results = await this.calculations.results([current.id, previous.id]);
    const metricsOfEvaluation = (evaluation: EvaluationRecord) =>
      shownResults(evaluation, results).flatMap((r) =>
        metricsOf(r.methodCode, r.outputs, r.inputs).filter((m) => m.stored),
      );
    const previousMetrics = metricsOfEvaluation(previous);
    const metrics = metricsOfEvaluation(current).flatMap((metric) => {
      const match = previousMetrics.find(
        (m) => m.metricCode === metric.metricCode && m.methodCode === metric.methodCode,
      );
      return match
        ? [
            {
              methodCode: metric.methodCode,
              metricCode: metric.metricCode,
              unit: metric.unit,
              previous: match.value,
              current: metric.value,
              delta: metric.value - match.value,
            },
          ]
        : [];
    });
    const patient = await this.clinical.patientRef(current.patientId);
    const timezone = patient?.timezone ?? 'America/Lima';
    return {
      current,
      previous,
      conditionDifferences: conditionDifferences(
        {
          evaluatorMemberId: current.evaluatorMemberId,
          conditions: current.conditions,
          minutesOfDay: minutesOfDay(current.measuredAt, timezone),
        },
        {
          evaluatorMemberId: previous.evaluatorMemberId,
          conditions: previous.conditions,
          minutesOfDay: minutesOfDay(previous.measuredAt, timezone),
        },
      ),
      sites: comparedSites,
      skinfoldSum6,
      metrics,
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
      const interpretation = interpret(m.siteCode, value, evaluation.patientSnapshot, ranges);
      if (interpretation)
        views.push({ siteCode: m.siteCode, value, unit: site.unit, interpretation });
    }
    return views;
  }

  async #audited(context: SecurityContext, evaluationId: string, patientId: string): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'assessment.calculation_result',
      resourceId: evaluationId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}
