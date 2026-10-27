import { Inject, Injectable } from '@nestjs/common';
import { METHODS_BY_POPULATION, type MethodCode, type Population } from '@nutricoach/engine';
import type { EvaluationLevel, SiteFamily, SiteUnit } from '../domain/assessment-rules.js';
import { effectivePreferences } from '../domain/calculation-plan.js';
import { CalculationService, shownResults } from './calculation.service.js';
import { consolidate } from './data-quality.js';
import { ResultsAssembly, type ResultsView } from './results-assembly.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  SITE_CATALOG,
  type CalculationStore,
  type EvaluationRecord,
  type EvaluationStore,
  type SiteCatalog,
} from './ports/assessment.ports.js';

/**
 * La composición que nutrition traduce a su BodyCompositionInput (02 §3, capa anticorrupción): peso y talla
 * consolidados, la edad decimal y la población al medir, y la masa libre de grasa del método principal de % de grasa,
 * que cita su método y su resultado.
 */
export interface CompositionBasis {
  readonly evaluationId: string;
  readonly measuredAt: Date;
  readonly level: EvaluationLevel | null;
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
  readonly population: Population;
  readonly weightKg: number;
  readonly heightCm: number;
  readonly fatFreeMass: {
    readonly kg: number;
    readonly methodCode: MethodCode;
    readonly calculationResultId: string;
  } | null;
}

/**
 * Una evaluación cerrada como la muestra su ficha PDF de resultados (RN-H01, RN-H04): sus condiciones, las medidas
 * consolidadas de cada sitio, los resultados vigentes con su método e interpretación (RN-D10) y la bioimpedancia, que
 * es una lectura del equipo y no un cálculo (RN-C08).
 */
export interface EvaluationSheet {
  readonly evaluation: {
    readonly id: string;
    readonly patientId: string;
    readonly kind: EvaluationRecord['kind'];
    readonly level: EvaluationLevel | null;
    readonly status: EvaluationRecord['status'];
    readonly revision: number;
    /** YYYY-MM-DD, fecha local de la medición. */
    readonly localDate: string;
    readonly measuredAt: Date;
    readonly closedAt: Date | null;
    readonly conditions: EvaluationRecord['conditions'];
    readonly subject: EvaluationRecord['patientSnapshot'];
    /** Quien midió: su marca propia va en la ficha (RN-H03). */
    readonly evaluatorMemberId: string;
    readonly createdBy: string;
  };
  readonly results: ResultsView;
  /** Cada sitio medido con su valor consolidado (RN-C03), en el orden del catálogo. */
  readonly sites: readonly {
    readonly code: string;
    readonly family: SiteFamily;
    readonly name: string;
    readonly unit: SiteUnit;
    readonly value: number;
  }[];
  readonly bia: readonly {
    readonly deviceBrand: string;
    readonly deviceModel: string;
    readonly readings: readonly {
      readonly metric: string;
      readonly value: number;
      readonly unit: string;
      readonly deviceLabel: string;
    }[];
  }[];
}

/** API pública de assessment para otros contextos. Se llama dentro de la transacción de quien la usa. */
@Injectable()
export class AssessmentApi {
  constructor(
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(CalculationService) private readonly calculation: CalculationService,
    @Inject(ResultsAssembly) private readonly assembly: ResultsAssembly,
  ) {}

  /** La evaluación para su ficha PDF; null si no existe o el contexto no la ve (RN-A05). Sin auditar: audita la descarga. */
  async evaluationSheet(evaluationId: string): Promise<EvaluationSheet | null> {
    const evaluation = await this.evaluations.find(evaluationId);
    if (!evaluation) return null;
    const catalog = [...(await this.catalog.all())].sort((a, b) => a.displayOrder - b.displayOrder);
    const measured = new Map(
      (await this.evaluations.measurements(evaluation.id)).map((m) => [m.siteCode, m]),
    );
    const sites = catalog.flatMap((site) => {
      const measurement = measured.get(site.code);
      const value = measurement ? consolidate(site, measurement.attempts).value : null;
      return value === null
        ? []
        : [{ code: site.code, family: site.family, name: site.nameEs, unit: site.unit, value }];
    });
    return {
      evaluation: {
        id: evaluation.id,
        patientId: evaluation.patientId,
        kind: evaluation.kind,
        level: evaluation.level,
        status: evaluation.status,
        revision: evaluation.revision,
        localDate: evaluation.localDate,
        measuredAt: evaluation.measuredAt,
        closedAt: evaluation.closedAt,
        conditions: evaluation.conditions,
        subject: evaluation.patientSnapshot,
        evaluatorMemberId: evaluation.evaluatorMemberId,
        createdBy: evaluation.createdBy,
      },
      results: await this.assembly.of(evaluation),
      sites,
      bia: (await this.evaluations.biaReadings(evaluation.id)).map((reading) => ({
        deviceBrand: reading.deviceBrand,
        deviceModel: reading.deviceModel,
        readings: reading.readings.map(({ metric, value, unit, deviceLabel }) => ({
          metric,
          value,
          unit,
          deviceLabel,
        })),
      })),
    };
  }

  /**
   * La evaluación cerrada indicada, o la última cerrada del paciente con peso y talla (una solo de bioimpedancia no los
   * tiene). null si no hay una. La masa libre de grasa es null si el método principal de % de grasa no se calculó.
   */
  async compositionBasis(
    patientId: string,
    evaluationId: string | null,
  ): Promise<CompositionBasis | null> {
    const candidates = evaluationId
      ? [await this.evaluations.find(evaluationId)]
      : (await this.evaluations.listByPatient(patientId)).filter((e) => e.status === 'CLOSED');
    for (const evaluation of candidates) {
      if (evaluation?.patientId !== patientId || evaluation.status !== 'CLOSED') continue;
      const values = await this.#values(evaluation);
      const weightKg = values.get('BASIC_WEIGHT');
      const heightCm = values.get('BASIC_HEIGHT');
      if (weightKg !== undefined && heightCm !== undefined) {
        return this.#basis(evaluation, weightKg, heightCm);
      }
    }
    return null;
  }

  async #basis(
    evaluation: EvaluationRecord,
    weightKg: number,
    heightCm: number,
  ): Promise<CompositionBasis> {
    const outcome = await this.calculation.outcomeOf(evaluation);
    const principal = shownResults(
      evaluation,
      await this.calculations.results([evaluation.id]),
    ).find((r) => outcome.principal.get(r.methodCode as MethodCode)?.includes('FAT_PCT'));
    const fatFreeMassKg = principal?.outputs.fatFreeMassKg;
    return {
      evaluationId: evaluation.id,
      measuredAt: evaluation.measuredAt,
      level: evaluation.level,
      sex: evaluation.patientSnapshot.sex,
      ageYears: evaluation.patientSnapshot.ageYears,
      population: evaluation.patientSnapshot.population as Population,
      weightKg,
      heightCm,
      fatFreeMass:
        principal && typeof fatFreeMassKg === 'number'
          ? {
              kg: fatFreeMassKg,
              methodCode: principal.methodCode as MethodCode,
              calculationResultId: principal.id,
            }
          : null,
    };
  }

  /** La TMR preferida para el paciente (RN-D05): la suya o la de su organización; la plataforma no fija una. */
  async preferredRmrMethod(patientId: string, population: Population): Promise<MethodCode | null> {
    return effectivePreferences(
      population,
      METHODS_BY_POPULATION[population],
      await this.calculations.preferenceRows(patientId),
    ).RMR.methodCode;
  }

  async #values(evaluation: EvaluationRecord): Promise<Map<string, number>> {
    const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
    const values = new Map<string, number>();
    for (const m of await this.evaluations.measurements(evaluation.id)) {
      const site = sites.get(m.siteCode);
      const value = site ? consolidate(site, m.attempts).value : null;
      if (value !== null) values.set(m.siteCode, value);
    }
    return values;
  }
}
