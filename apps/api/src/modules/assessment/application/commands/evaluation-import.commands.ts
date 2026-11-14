import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically, ImportRecordStore, type ImportOrigin } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import {
  checkAttempts,
  closeError,
  decimalAgeYears,
  EVALUATOR_NOT_MEMBER,
  progressOf,
  SITE_NOT_FOUND,
  type EvaluationLevel,
  type MeasurementSide,
} from '../../domain/assessment-rules.js';
import { assessmentEvent, type AssessmentEventType } from '../assessment-events.js';
import { consolidate, firstTwo } from '../data-quality.js';
import { localDateOf } from '../local-date.js';
import {
  EVALUATION_STORE,
  SITE_CATALOG,
  type EvaluationStore,
  type SiteCatalog,
} from '../ports/assessment.ports.js';

export interface ImportedMeasurement {
  readonly siteCode: string;
  readonly attempts: readonly number[];
  readonly side: MeasurementSide;
}

export interface EvaluationImportInput {
  readonly origin: ImportOrigin;
  readonly patientId: string;
  readonly level: EvaluationLevel;
  readonly measuredAt: Date;
  readonly fasting: boolean;
  readonly intenseActivityLast24h: boolean;
  readonly measurements: readonly ImportedMeasurement[];
}

/**
 * La importación de una evaluación antropométrica del sistema anterior (RF-40, RN-I05; ADR-135), en una transacción: las tomas se
 * validan como en la app (RN-C02 a RN-C04) y la evaluación se cierra si su nivel está completo (RF-14), así que el motor calcula sus
 * resultados con los métodos de la organización (RN-D01). Evaluador y autor, el nutricionista de la cuenta. Si la fila ya entró,
 * devuelve la misma evaluación sin tocar nada.
 */
@Injectable()
export class EvaluationImportCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    private readonly records: ImportRecordStore,
  ) {}

  importEvaluation(
    context: SecurityContext,
    input: EvaluationImportInput,
  ): Promise<Result<{ id: string; created: boolean }, DomainError>> {
    const organizationId = context.organizationId;
    const userId = context.userId;
    if (!organizationId || !userId) throw new Error('Importación sin organización activa.');
    return atomically<{ id: string; created: boolean }>(this.uow, context, async () => {
      const existing = await this.records.find(organizationId, 'EVALUATION', input.origin);
      if (existing) return ok({ id: existing, created: false });
      const patient = await this.clinical.ensureImportWritable(context, input.patientId);
      if (!patient.ok) return patient;
      const evaluatorMemberId = input.origin.accountMemberId;
      if (!(await this.tenancy.isActiveMemberId(organizationId, evaluatorMemberId))) {
        return err(EVALUATOR_NOT_MEMBER);
      }
      const sites = await this.catalog.all();
      const bySite = new Map(sites.map((site) => [site.code, site]));
      const measured = [];
      for (const measurement of input.measurements) {
        const site = bySite.get(measurement.siteCode);
        if (!site) return err(SITE_NOT_FOUND(measurement.siteCode));
        const invalid = checkAttempts(
          site,
          measurement.attempts,
          firstTwo(site, measurement.attempts),
        );
        if (invalid) return err(invalid);
        measured.push({ measurement, consolidation: consolidate(site, measurement.attempts) });
      }
      const evaluation = { kind: 'ANTHROPOMETRY', level: input.level } as const;
      const progress = progressOf(
        evaluation,
        sites,
        measured.map((m) => ({ siteCode: m.measurement.siteCode, consolidation: m.consolidation })),
        0,
      );
      const blocked = closeError(evaluation, progress, 0);
      if (blocked) return err(blocked);

      const id = this.ids.newId<'EvaluationId'>();
      const now = this.clock.now();
      const localDate = localDateOf(input.measuredAt, patient.value.timezone);
      await this.evaluations.insert({
        id,
        organizationId,
        patientId: input.patientId,
        evaluatorMemberId,
        kind: evaluation.kind,
        level: input.level,
        measuredAt: input.measuredAt,
        localDate,
        conditions: {
          schemaVersion: 1,
          fasting: input.fasting,
          intenseActivityLast24h: input.intenseActivityLast24h,
          hydration: null,
        },
        patientSnapshot: {
          sex: patient.value.sex,
          ageYears: decimalAgeYears(patient.value.birthDate, localDate),
          population: patient.value.population,
        },
        status: 'DRAFT',
        revision: 1,
        amendsEvaluationId: null,
        amendReason: null,
        closedAt: null,
        notes: null,
        createdBy: userId,
        createdAt: now,
        version: 0,
      });
      for (const { measurement, consolidation } of measured) {
        await this.evaluations.saveMeasurement(id, organizationId, {
          siteCode: measurement.siteCode,
          attempts: measurement.attempts,
          side: measurement.side,
          consolidatedValue: consolidation.value,
          consolidation: consolidation.method,
          diffPct: consolidation.diffPct,
          needsThird: consolidation.needsThird,
        });
      }
      if (!(await this.evaluations.close(id, 0, now))) {
        throw new Error('La evaluación importada no se pudo cerrar.');
      }
      await this.#emit(context, 'assessment.evaluation.created', input.patientId, id, {
        kind: evaluation.kind,
        level: input.level,
      });
      await this.#emit(context, 'assessment.evaluation.closed', input.patientId, id, {
        evaluationId: id,
        revision: 1,
        amendsEvaluationId: null,
      });
      await this.records.insert(organizationId, 'EVALUATION', input.origin, id);
      return ok({ id, created: true });
    });
  }

  /**
   * El muestreo del informe (RN-I05): vuelve a leer la evaluación importada y devuelve los campos que no coinciden con su fila de
   * origen, sin sus valores. Es parte de la importación: no la hace una persona y no se audita como lectura.
   */
  verify(
    context: SecurityContext,
    evaluationId: string,
    input: Omit<EvaluationImportInput, 'origin'>,
  ): Promise<readonly string[]> {
    return this.uow.query(context, async () => {
      const evaluation = await this.evaluations.find(evaluationId);
      if (!evaluation) return ['evaluacion'];
      const stored = new Map(
        (await this.evaluations.measurements(evaluationId)).map((m) => [m.siteCode, m]),
      );
      const sameTomas =
        stored.size === input.measurements.length &&
        input.measurements.every((m) => {
          const found = stored.get(m.siteCode);
          return (
            found !== undefined &&
            found.side === m.side &&
            found.attempts.length === m.attempts.length &&
            found.attempts.every((value, i) => Math.abs(value - (m.attempts[i] ?? NaN)) < 1e-9)
          );
        });
      const checks: readonly [string, boolean][] = [
        ['id_paciente', evaluation.patientId === input.patientId],
        ['estado', evaluation.status === 'CLOSED'],
        ['nivel', evaluation.level === input.level],
        ['fecha', evaluation.measuredAt.getTime() === input.measuredAt.getTime()],
        ['en_ayunas', evaluation.conditions.fasting === input.fasting],
        [
          'actividad_intensa_24h',
          evaluation.conditions.intenseActivityLast24h === input.intenseActivityLast24h,
        ],
        ['tomas', sameTomas],
      ];
      return checks.filter(([, same]) => !same).map(([field]) => field);
    });
  }

  async #emit(
    context: SecurityContext,
    type: AssessmentEventType,
    patientId: string,
    aggregateId: string,
    payload: object,
  ): Promise<void> {
    if (!context.organizationId || !context.userId) return;
    await this.outbox.append(
      [
        assessmentEvent(
          type,
          context.organizationId,
          aggregateId,
          { patientId, ...payload },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}
