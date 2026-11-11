import { Inject, Injectable } from '@nestjs/common';
import { METHODS_BY_POPULATION, type MethodCode, type Population } from '@nutricoach/engine';
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
import type { SiteDefinition, SiteFamily, SiteUnit } from '../../domain/assessment-rules.js';
import {
  effectivePreferences,
  principalPurposes,
  type PreferenceRow,
} from '../../domain/calculation-plan.js';
import { SKINFOLD_SUM6_SITES } from '../../domain/comparison.js';
import {
  evolutionOf,
  type BiaSeries,
  type EvolutionInput,
  type EvolutionSeries,
  type MetricSeries,
  type SiteSeries,
} from '../../domain/evolution.js';
import { shownResults } from '../calculation.service.js';
import { consolidate, mdc95, technicalError } from '../data-quality.js';
import { minutesOfDay } from '../local-date.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  PATIENT_EVOLUTION_STORE,
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
  type CalculationStore,
  type EvaluationRecord,
  type EvaluationStore,
  type PatientEvolutionStore,
  type SiteCatalog,
  type StoredResult,
  type TechnicalErrorStore,
} from '../ports/assessment.ports.js';
import { metricsOf } from '../result-metrics.js';

type Pairs = readonly (readonly [number, number])[];

/** Un sitio de una evaluación con sus tomas y el ETM de su evaluador en esa fecha (RN-C05). */
interface SiteMaterial {
  readonly attempts: readonly number[];
  readonly temAbs: number | null;
  readonly pairs: Pairs | null;
}

/** Lo que entra de cada evaluación cerrada, venga de los repositorios (equipo) o de las funciones del paciente. */
interface EvaluationMaterial {
  readonly evaluation: EvaluationRecord;
  readonly sites: ReadonlyMap<string, SiteMaterial>;
  readonly bia: EvolutionInput['bia'];
}

export interface EvolutionView {
  readonly evaluations: readonly {
    readonly evaluationId: string;
    readonly localDate: string;
    readonly kind: EvaluationRecord['kind'];
    readonly level: EvaluationRecord['level'];
    readonly revision: number;
    readonly evaluatorMemberId: string;
    readonly conditionDifferences: readonly string[];
  }[];
  readonly sites: readonly (SiteSeries & {
    readonly name: string;
    readonly family: SiteFamily;
    readonly unit: SiteUnit;
  })[];
  readonly skinfoldSum6: EvolutionSeries | null;
  readonly metrics: readonly MetricSeries[];
  readonly bia: readonly BiaSeries[];
}

export type PatientEvolutionItem =
  'WEIGHT' | 'WAIST' | 'HIP' | 'SKINFOLD_SUM6' | 'FAT_PCT' | 'MUSCLE_MASS';

export interface PatientEvolutionView {
  readonly evaluationCount: number;
  readonly items: readonly (EvolutionSeries & {
    readonly item: PatientEvolutionItem;
    readonly unit: string;
    readonly methodCode: string;
  })[];
}

/** La serie de una evolución lista para la ficha: hasta su evaluación de origen, incluida (RN-H02). */
export interface EvolutionSheetSource {
  readonly origin: EvaluationRecord;
  readonly view: EvolutionView;
}

/** Las medidas que se consolidan con el método de tomas de ISAK (RN-C03): el método de su número (RN-D02). */
export const CONSOLIDATION_METHOD = 'CONSOLIDATE_ISAK';

/** La masa muscular de cada método de músculo: Lee da la esquelética; 4 y 5 componentes, la muscular. */
const MUSCLE_METRIC: Readonly<Record<string, string>> = {
  MUSCLE_LEE2000: 'SKELETAL_MUSCLE_MASS_KG',
  COMP4_DEROSE_GUIMARAES: 'MUSCLE_MASS_KG',
  COMP5_KERR1988: 'MUSCLE_MASS_KG',
};

const byMeasurement = (a: EvaluationRecord, b: EvaluationRecord) =>
  a.measuredAt.getTime() - b.measuredAt.getTime() || a.id.localeCompare(b.id);

/**
 * La evolución antropométrica (RF-35, RF-30): las evaluaciones cerradas vigentes del paciente en orden de medición. Las
 * medidas se consolidan como en la evaluación (RN-C03) y su cambio se compara con el CMD95 del evaluador de cada punto
 * (RN-C06); los indicadores van por método (RN-D03) y la bioimpedancia por equipo (RN-C08). Leerla deja un READ (RN-B03).
 */
@Injectable()
export class EvolutionQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(TECHNICAL_ERROR_STORE) private readonly errors: TechnicalErrorStore,
    @Inject(PATIENT_EVOLUTION_STORE) private readonly patientStore: PatientEvolutionStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  /** La del equipo de atención (RF-35): null si el paciente no existe o el contexto no lo ve (RN-A05). */
  async evolution(context: SecurityContext, patientId: string): Promise<EvolutionView | null> {
    const view = await this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return null;
      return this.#staffView(patientId, patient.timezone, null);
    });
    if (!view) return null;
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'assessment.evolution',
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
    return view;
  }

  /**
   * Para la ficha de evolución (RN-H01): la serie hasta la evaluación de origen, en la transacción de quien llama. null si el
   * origen no es una evaluación cerrada vigente.
   */
  async sheetSource(evaluationId: string): Promise<EvolutionSheetSource | null> {
    const origin = await this.evaluations.find(evaluationId);
    if (!origin || origin.status !== 'CLOSED') return null;
    const patient = await this.clinical.patientRef(origin.patientId);
    if (!patient) return null;
    return {
      origin,
      view: await this.#staffView(origin.patientId, patient.timezone, origin),
    };
  }

  /**
   * Lo que ve el paciente en su app (RF-30, ADR-091): el peso, la cintura y la suma de 6 pliegues, con el cambio contra el
   * CMD95, y el % de grasa y la masa muscular de su método principal (RN-D05). Sin interpretaciones clínicas.
   */
  async patientEvolution(context: SecurityContext): Promise<PatientEvolutionView> {
    const patientId = context.patientId;
    if (!patientId) return { evaluationCount: 0, items: [] };
    const view = await this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      const closed = (await this.evaluations.listByPatient(patientId))
        .filter((evaluation) => evaluation.status === 'CLOSED')
        .sort(byMeasurement);
      const results = await this.calculations.results(closed.map(({ id }) => id));
      const rows = await this.patientStore.sites();
      const sitesOf = new Map<string, Map<string, SiteMaterial>>();
      for (const row of rows) {
        const sites = sitesOf.get(row.evaluationId) ?? new Map<string, SiteMaterial>();
        sites.set(row.siteCode, { attempts: row.attempts, temAbs: row.temAbs, pairs: row.pairs });
        sitesOf.set(row.evaluationId, sites);
      }
      const material = closed.map((evaluation) => ({
        evaluation,
        sites: sitesOf.get(evaluation.id) ?? new Map<string, SiteMaterial>(),
        bia: [],
      }));
      const evolution = await this.#build(material, results, patient?.timezone ?? 'America/Lima');
      const principal = this.#principal(closed, results, await this.patientStore.preferences());
      return { closed, evolution, principal };
    });
    const { evolution, principal } = view;
    const site = (siteCode: string) => evolution.sites.find((s) => s.siteCode === siteCode);
    const metric = (metricCode: string, methodCode: string | null) =>
      methodCode
        ? evolution.metrics.find((m) => m.metricCode === metricCode && m.methodCode === methodCode)
        : undefined;
    const weight = site('BASIC_WEIGHT');
    const waist = site('GIRTH_WAIST');
    // La cadera, como en la «Comparativa física» de la hoja de Jeremy (P14.5, PR 6a; ADR-107).
    const hip = site('GIRTH_HIP');
    const fat = metric('FAT_PCT', principal.fat);
    const muscle = metric(MUSCLE_METRIC[principal.muscle ?? ''] ?? '', principal.muscle);
    const items: PatientEvolutionView['items'][number][] = [
      ...(weight
        ? [
            {
              item: 'WEIGHT' as const,
              unit: 'kg',
              methodCode: CONSOLIDATION_METHOD,
              ...seriesOnly(weight),
            },
          ]
        : []),
      ...(waist
        ? [
            {
              item: 'WAIST' as const,
              unit: 'cm',
              methodCode: CONSOLIDATION_METHOD,
              ...seriesOnly(waist),
            },
          ]
        : []),
      ...(hip
        ? [
            {
              item: 'HIP' as const,
              unit: 'cm',
              methodCode: CONSOLIDATION_METHOD,
              ...seriesOnly(hip),
            },
          ]
        : []),
      ...(evolution.skinfoldSum6
        ? [
            {
              item: 'SKINFOLD_SUM6' as const,
              unit: 'mm',
              methodCode: CONSOLIDATION_METHOD,
              ...seriesOnly(evolution.skinfoldSum6),
            },
          ]
        : []),
      ...(fat
        ? [
            {
              item: 'FAT_PCT' as const,
              unit: fat.unit,
              methodCode: fat.methodCode,
              ...seriesOnly(fat),
            },
          ]
        : []),
      ...(muscle
        ? [
            {
              item: 'MUSCLE_MASS' as const,
              unit: muscle.unit,
              methodCode: muscle.methodCode,
              ...seriesOnly(muscle),
            },
          ]
        : []),
    ];
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'assessment.evolution',
      resourceId: patientId,
      patientId,
    });
    return { evaluationCount: view.closed.length, items };
  }

  /** Las evaluaciones cerradas vigentes del paciente, con sus tomas, el ETM de su evaluador y su bioimpedancia. */
  async #staffView(
    patientId: string,
    timezone: string,
    until: EvaluationRecord | null,
  ): Promise<EvolutionView> {
    const closed = (await this.evaluations.listByPatient(patientId))
      .filter((evaluation) => evaluation.status === 'CLOSED')
      .filter((evaluation) => !until || byMeasurement(evaluation, until) <= 0)
      .sort(byMeasurement);
    const results = await this.calculations.results(closed.map(({ id }) => id));
    const errorsBy = new Map<string, Promise<ReadonlyMap<string, SiteMaterial>>>();
    const errorsOf = (evaluation: EvaluationRecord) => {
      const key = `${evaluation.evaluatorMemberId}|${evaluation.localDate}`;
      let found = errorsBy.get(key);
      if (!found) {
        found = this.errors
          .current(evaluation.evaluatorMemberId, evaluation.localDate)
          .then(
            (rows) =>
              new Map(
                rows.map((row) => [
                  row.siteCode,
                  { attempts: [], temAbs: row.temAbs, pairs: row.pairs },
                ]),
              ),
          );
        errorsBy.set(key, found);
      }
      return found;
    };
    const material: EvaluationMaterial[] = [];
    for (const evaluation of closed) {
      const errors = await errorsOf(evaluation);
      const sites = new Map<string, SiteMaterial>();
      for (const measurement of await this.evaluations.measurements(evaluation.id)) {
        const error = errors.get(measurement.siteCode);
        sites.set(measurement.siteCode, {
          attempts: measurement.attempts,
          temAbs: error?.temAbs ?? null,
          pairs: error?.pairs ?? null,
        });
      }
      const bia = (await this.evaluations.biaReadings(evaluation.id)).flatMap((reading) =>
        reading.readings.map((value) => ({
          device: `${reading.deviceBrand} · ${reading.deviceModel}`,
          metric: value.metric,
          deviceLabel: value.deviceLabel,
          unit: value.unit,
          value: value.value,
        })),
      );
      material.push({ evaluation, sites, bia });
    }
    return this.#build(material, results, timezone);
  }

  async #build(
    material: readonly EvaluationMaterial[],
    results: readonly StoredResult[],
    timezone: string,
  ): Promise<EvolutionView> {
    const catalog = new Map((await this.catalog.all()).map((site) => [site.code, site]));
    const inputs = material.map((item) => inputOf(item, catalog, results, timezone));
    const evolution = evolutionOf(inputs);
    const order = (code: string) => catalog.get(code)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
    return {
      evaluations: evolution.evaluations.map((entry, index) => {
        const evaluation = material[index]?.evaluation;
        if (!evaluation) throw new Error('La evolución perdió una evaluación.');
        return {
          evaluationId: entry.evaluationId,
          localDate: entry.localDate,
          kind: evaluation.kind,
          level: evaluation.level,
          revision: evaluation.revision,
          evaluatorMemberId: evaluation.evaluatorMemberId,
          conditionDifferences: entry.conditionDifferences,
        };
      }),
      sites: [...evolution.sites]
        .sort((a, b) => order(a.siteCode) - order(b.siteCode))
        .flatMap((series) => {
          const site = catalog.get(series.siteCode);
          return site
            ? [{ ...series, name: site.nameEs, family: site.family, unit: site.unit }]
            : [];
        }),
      skinfoldSum6: evolution.skinfoldSum6,
      metrics: evolution.metrics,
      bia: evolution.bia,
    };
  }

  /**
   * El método principal de % de grasa y de masa muscular de la última evaluación con antropometría, como en sus resultados
   * (RN-D05): la preferencia del paciente, si no la de su organización, si no la de la plataforma, si se calculó.
   */
  #principal(
    closed: readonly EvaluationRecord[],
    results: readonly StoredResult[],
    rows: readonly PreferenceRow[],
  ): { readonly fat: string | null; readonly muscle: string | null } {
    const latest = closed.findLast((evaluation) => evaluation.level !== null);
    if (!latest) return { fat: null, muscle: null };
    const population = latest.patientSnapshot.population as Population;
    const platform = METHODS_BY_POPULATION[population];
    const computed = shownResults(latest, results).map(
      ({ methodCode }) => methodCode as MethodCode,
    );
    const principal = principalPurposes(
      computed,
      platform,
      effectivePreferences(population, platform, rows),
    );
    const purposeOf = (purpose: 'FAT_PCT' | 'MUSCLE') =>
      [...principal].find(([, purposes]) => purposes.includes(purpose))?.[0] ?? null;
    return { fat: purposeOf('FAT_PCT'), muscle: purposeOf('MUSCLE') };
  }
}

const seriesOnly = (series: EvolutionSeries): EvolutionSeries => ({
  points: series.points,
  overall: series.overall,
});

/** El ETM de un sitio: el calculado desde sus pares, si están; si no, el declarado (RN-C05). */
const temOf = (site: SiteMaterial): number | null =>
  site.pairs ? (technicalError(site.pairs)?.temAbs ?? site.temAbs) : site.temAbs;

/** Una evaluación como entrada de la evolución: sus medidas consolidadas con su CMD95, sus indicadores y su bioimpedancia. */
function inputOf(
  material: EvaluationMaterial,
  catalog: ReadonlyMap<string, SiteDefinition>,
  results: readonly StoredResult[],
  timezone: string,
): EvolutionInput {
  const { evaluation } = material;
  const values = new Map<string, number>();
  const minimal = new Map<string, number>();
  for (const [siteCode, site] of material.sites) {
    const definition = catalog.get(siteCode);
    const value = definition ? consolidate(definition, site.attempts).value : null;
    if (value === null) continue;
    values.set(siteCode, value);
    const tem = temOf(site);
    if (tem !== null) minimal.set(siteCode, mdc95(tem));
  }
  const sum = SKINFOLD_SUM6_SITES.every((code) => values.has(code))
    ? SKINFOLD_SUM6_SITES.reduce((total, code) => total + (values.get(code) ?? 0), 0)
    : null;
  const pairs = SKINFOLD_SUM6_SITES.map((code) => material.sites.get(code)?.pairs ?? null);
  // G-04: sobre la suma, el CMD95 usa el %ETM agrupado de los pares de sus seis pliegues.
  const pooled = pairs.every((p) => p !== null) ? technicalError(pairs.flat()) : null;
  return {
    evaluationId: evaluation.id,
    localDate: evaluation.localDate,
    compared: {
      evaluatorMemberId: evaluation.evaluatorMemberId,
      conditions: evaluation.conditions,
      minutesOfDay: minutesOfDay(evaluation.measuredAt, timezone),
    },
    sites: values,
    siteMdc95: minimal,
    skinfoldSum6: sum,
    skinfoldSum6Mdc95: sum !== null && pooled ? mdc95((pooled.temRelPct / 100) * sum) : null,
    metrics: shownResults(evaluation, results).flatMap((result) =>
      metricsOf(result.methodCode, result.outputs, result.inputs)
        .filter((metric) => metric.stored)
        .map(({ metricCode, methodCode, unit, value }) => ({
          metricCode,
          methodCode,
          unit,
          value,
        })),
    ),
    bia: material.bia,
  };
}
