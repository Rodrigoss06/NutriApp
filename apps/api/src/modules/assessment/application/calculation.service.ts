import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  OUTBOX,
  type Clock,
  type IdGenerator,
  type Outbox,
  type SecurityContext,
} from '@nutricoach/shared-kernel';
import type { Population } from '@nutricoach/engine';
import { TenancyApi } from '../../tenancy/index.js';
import { assessmentEvent } from './assessment-events.js';
import { calculateEvaluation, type CalculationOutcome } from './calculation.js';
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
import { metricsOf } from './result-metrics.js';

export interface CalculationOptions {
  /** RN-D11: el coeficiente de Lee de esta evaluación, si el profesional lo cambia al recalcular. */
  readonly referenceGroupCoefficient?: number | undefined;
}

export interface ComputationSummary {
  readonly created: number;
  readonly superseded: number;
}

/** Lo que se muestra de una evaluación: los vigentes; de una enmendada, el último de cada método. */
export function shownResults(
  evaluation: Pick<EvaluationRecord, 'id' | 'status'>,
  results: readonly StoredResult[],
): StoredResult[] {
  const own = results.filter((r) => r.evaluationId === evaluation.id);
  if (evaluation.status === 'CLOSED') return own.filter((r) => r.status === 'CURRENT');
  if (evaluation.status !== 'AMENDED') return [];
  const latest = new Map<string, StoredResult>();
  for (const result of own) latest.set(result.methodCode, result);
  return [...latest.values()];
}

/**
 * Cálculo de una evaluación cerrada (RN-D01, RN-D08): resultados inmutables con su método, versión, versión del motor
 * e insumos con su hash, e indicadores en formato largo. Corre en la transacción de quien llama: el worker al cerrar,
 * o el recálculo explícito. Con los mismos insumos y versiones no crea nada; si cambian, crea un resultado nuevo y
 * deja el anterior como SUPERSEDED.
 */
@Injectable()
export class CalculationService {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  /** El cálculo sin guardar: lo que se haría con los datos y las preferencias de hoy. */
  async outcomeOf(
    evaluation: EvaluationRecord,
    options: CalculationOptions = {},
  ): Promise<CalculationOutcome> {
    const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
    const values = new Map<string, number>();
    for (const measurement of await this.evaluations.measurements(evaluation.id)) {
      const site = sites.get(measurement.siteCode);
      const value = site ? consolidate(site, measurement.attempts).value : null;
      if (value !== null) values.set(measurement.siteCode, value);
    }
    return calculateEvaluation({
      level: evaluation.level,
      subject: {
        sex: evaluation.patientSnapshot.sex,
        ageYears: evaluation.patientSnapshot.ageYears,
        population: evaluation.patientSnapshot.population as Population,
      },
      values,
      preferenceRows: await this.calculations.preferenceRows(evaluation.patientId),
      referenceGroupCoefficient: await this.#coefficient(evaluation, options),
    });
  }

  async compute(
    context: SecurityContext,
    evaluation: EvaluationRecord,
    options: CalculationOptions = {},
  ): Promise<ComputationSummary> {
    const outcome = await this.outcomeOf(evaluation, options);
    const existing = await this.calculations.results([evaluation.id]);
    const current = existing.filter((r) => r.status === 'CURRENT');
    const kept = new Set<string>();
    let created = 0;
    let superseded = 0;
    const computedAt = this.clock.now();
    for (const result of outcome.results) {
      const same = existing.find(
        (r) =>
          r.methodCode === result.methodCode &&
          r.methodVersion === result.methodVersion &&
          r.inputsHash === result.inputsHash,
      );
      let targetId: string;
      if (same) {
        targetId = same.id;
        if (same.status !== 'CURRENT') await this.calculations.setStatus(same.id, 'CURRENT', null);
      } else {
        targetId = this.ids.newId<'CalculationResultId'>();
        const stored: StoredResult = {
          id: targetId,
          evaluationId: evaluation.id,
          patientId: evaluation.patientId,
          methodCode: result.methodCode,
          methodVersion: result.methodVersion,
          engineVersion: result.engineVersion,
          inputs: result.inputs,
          inputsHash: result.inputsHash,
          outputs: result.outputs,
          warnings: result.warnings,
          status: 'CURRENT',
          supersededBy: null,
          measuredAt: evaluation.measuredAt,
          computedAt,
        };
        const metrics = metricsOf(result.methodCode, result.outputs, result.inputs).filter(
          (metric) => metric.stored,
        );
        await this.calculations.insertResult(evaluation.organizationId, stored, metrics);
        created += 1;
      }
      kept.add(targetId);
      for (const previous of current.filter(
        (r) => r.methodCode === result.methodCode && r.id !== targetId,
      )) {
        await this.calculations.setStatus(previous.id, 'SUPERSEDED', targetId);
        kept.add(previous.id);
        superseded += 1;
      }
    }
    // Un método que ya no se calcula (otra preferencia o población) deja su resultado como histórico.
    for (const previous of current.filter((r) => !kept.has(r.id))) {
      await this.calculations.setStatus(previous.id, 'SUPERSEDED', null);
      superseded += 1;
    }
    if (created > 0 || superseded > 0) {
      await this.#emit(context, evaluation, { created, superseded });
    }
    return { created, superseded };
  }

  /** Al cerrar una revisión (RN-C07): los vigentes de la evaluación enmendada pasan a ser histórico. */
  async supersedeAmended(original: string, revision: string): Promise<void> {
    const results = await this.calculations.results([original, revision]);
    const replacements = new Map(
      results
        .filter((r) => r.evaluationId === revision && r.status === 'CURRENT')
        .map((r) => [r.methodCode, r.id]),
    );
    for (const result of results.filter(
      (r) => r.evaluationId === original && r.status === 'CURRENT',
    )) {
      await this.calculations.setStatus(
        result.id,
        'SUPERSEDED',
        replacements.get(result.methodCode) ?? null,
      );
    }
  }

  /** RN-D11: el del recálculo; si no, el que quedó en los insumos del Lee vigente; si no, el de la organización. */
  async #coefficient(
    evaluation: EvaluationRecord,
    options: CalculationOptions,
  ): Promise<number | null> {
    if (options.referenceGroupCoefficient !== undefined) return options.referenceGroupCoefficient;
    const lee = (await this.calculations.results([evaluation.id])).find(
      (r) => r.methodCode === 'MUSCLE_LEE2000' && r.status === 'CURRENT',
    );
    const used = lee?.inputs.referenceGroupCoefficient;
    if (typeof used === 'number') return used;
    return this.tenancy.leeReferenceGroupCoefficient(evaluation.organizationId);
  }

  async #emit(
    context: SecurityContext,
    evaluation: EvaluationRecord,
    summary: ComputationSummary,
  ): Promise<void> {
    await this.outbox.append(
      [
        assessmentEvent(
          'assessment.result.computed',
          evaluation.organizationId,
          evaluation.id,
          { patientId: evaluation.patientId, evaluationId: evaluation.id, ...summary },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}
