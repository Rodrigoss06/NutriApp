import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import {
  progressOf,
  type Consolidation,
  type EvaluationProgress,
  type SiteDefinition,
  type SiteFamily,
  type SiteUnit,
} from '../../domain/assessment-rules.js';
import { consolidate, mdc95, technicalError } from '../data-quality.js';
import { localDateOf } from '../local-date.js';
import {
  EVALUATION_STORE,
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
  type BiaReadingRecord,
  type EvaluationRecord,
  type EvaluationStore,
  type MeasurementRecord,
  type SiteCatalog,
  type TechnicalErrorRecord,
  type TechnicalErrorStore,
} from '../ports/assessment.ports.js';

export interface EvaluationSummaryView extends EvaluationRecord {
  readonly amendedByEvaluationId: string | null;
}

export interface EvaluationView extends EvaluationSummaryView {
  readonly measurements: readonly (MeasurementRecord & { readonly consolidation: Consolidation })[];
  readonly biaReadings: readonly BiaReadingRecord[];
  readonly progress: EvaluationProgress;
}

export interface TechnicalErrorView extends TechnicalErrorRecord {
  readonly mdc95: number;
}

export interface PooledTechnicalErrorView {
  readonly family: SiteFamily;
  readonly unit: SiteUnit;
  readonly siteCodes: readonly string[];
  readonly temAbs: number;
  readonly temRelPct: number;
  readonly mdc95: number;
  readonly methodVersion: string;
}

export interface TechnicalErrorsView {
  readonly memberId: string;
  readonly current: readonly TechnicalErrorView[];
  readonly pooled: readonly PooledTechnicalErrorView[];
}

/**
 * Lecturas de evaluaciones (RF-11, RF-14). La RLS deja ver solo lo que RN-A05 permite; toda lectura de una
 * evaluación deja un READ en la auditoría (RN-B03). Los consolidados se calculan con el motor al leer, sin redondear.
 */
@Injectable()
export class EvaluationQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(TECHNICAL_ERROR_STORE) private readonly errors: TechnicalErrorStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  /** El catálogo global, en el orden del protocolo; no es dato de un paciente. */
  async sites(context: SecurityContext): Promise<readonly SiteDefinition[]> {
    const sites = await this.uow.query(context, () => this.catalog.all());
    return [...sites].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /** Las evaluaciones del paciente, de la más reciente a la más antigua; null si el contexto no lo ve. */
  async list(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly EvaluationSummaryView[] | null> {
    const rows = await this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return null;
      const evaluations = await this.evaluations.listByPatient(patientId);
      const amendedBy = await this.evaluations.amendedBy(evaluations.map(({ id }) => id));
      return evaluations.map((e) => ({ ...e, amendedByEvaluationId: amendedBy.get(e.id) ?? null }));
    });
    if (!rows) return null;
    await this.#audited(context, 'assessment.evaluation', patientId, patientId);
    return rows;
  }

  async get(context: SecurityContext, id: string): Promise<EvaluationView | null> {
    const view = await this.uow.query(context, async () => {
      const evaluation = await this.evaluations.find(id);
      if (!evaluation) return null;
      const sites = await this.catalog.all();
      const bySite = new Map(sites.map((site) => [site.code, site]));
      const measurements = (await this.evaluations.measurements(id)).flatMap((m) => {
        const site = bySite.get(m.siteCode);
        return site ? [{ ...m, consolidation: consolidate(site, m.attempts) }] : [];
      });
      const biaReadings = await this.evaluations.biaReadings(id);
      const amendedBy = await this.evaluations.amendedBy([id]);
      return {
        ...evaluation,
        amendedByEvaluationId: amendedBy.get(id) ?? null,
        measurements,
        biaReadings,
        progress: progressOf(evaluation, sites, measurements, biaReadings.length),
      };
    });
    if (!view) return null;
    await this.#audited(context, 'assessment.evaluation', id, view.patientId);
    return view;
  }

  /**
   * El ETM vigente hoy de un evaluador por sitio, con su CMD95, y el agrupado por familia (TEM_ISAK sobre todos los
   * pares de los sitios con estudio): con los seis pliegues de Luis, 0.374 mm y 2.35 % (G-04). null si no es miembro.
   */
  async technicalErrors(
    context: SecurityContext,
    memberId: string,
  ): Promise<TechnicalErrorsView | null> {
    const organizationId = context.organizationId;
    if (!organizationId) throw new Error('ETM sin organización activa.');
    return this.uow.query(context, async () => {
      if (!(await this.tenancy.isActiveMemberId(organizationId, memberId))) return null;
      const timezone =
        (await this.tenancy.organization(organizationId))?.timezone ?? 'America/Lima';
      const rows = await this.errors.current(memberId, localDateOf(this.clock.now(), timezone));
      const current = rows.map((row) => {
        // Con pares, el ETM se recalcula sin el redondeo de la columna (RN-D09).
        const exact = row.pairs ? technicalError(row.pairs) : null;
        const temAbs = exact?.temAbs ?? row.temAbs;
        return {
          ...row,
          temAbs,
          temRelPct: exact?.temRelPct ?? row.temRelPct,
          mdc95: mdc95(temAbs),
        };
      });
      return { memberId, current, pooled: pooled(current, await this.catalog.all()) };
    });
  }

  async #audited(
    context: SecurityContext,
    resourceType: string,
    resourceId: string,
    patientId: string,
  ): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType,
      resourceId: resourceId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}

/** ETM agrupado por familia con los sitios que tienen pares (RN-C05); los declarados no entran. */
function pooled(
  current: readonly TechnicalErrorView[],
  sites: readonly SiteDefinition[],
): PooledTechnicalErrorView[] {
  const bySite = new Map(sites.map((site) => [site.code, site]));
  const families = new Map<SiteFamily, { unit: SiteUnit; rows: TechnicalErrorView[] }>();
  for (const row of current) {
    const site = bySite.get(row.siteCode);
    if (!site || !row.pairs) continue;
    const group = families.get(site.family) ?? { unit: site.unit, rows: [] };
    group.rows.push(row);
    families.set(site.family, group);
  }
  return [...families].flatMap(([family, { unit, rows }]) => {
    const tem = technicalError(rows.flatMap((row) => row.pairs ?? []));
    if (!tem) return [];
    return [
      {
        family,
        unit,
        siteCodes: rows.map(({ siteCode }) => siteCode),
        temAbs: tem.temAbs,
        temRelPct: tem.temRelPct,
        mdc95: mdc95(tem.temAbs),
        methodVersion: tem.methodVersion,
      },
    ];
  });
}
