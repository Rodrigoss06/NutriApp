import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { TimelineCursor, TimelineEntry } from '../../../../clinical/index.js';
import type {
  BiaReadingRecord,
  BiaValueRecord,
  EvaluationChanges,
  EvaluationRecord,
  EvaluationStore,
  MeasurementRecord,
  MeasurementRow,
  PatientSnapshot,
  SiteCatalog,
  TechnicalErrorRecord,
  TechnicalErrorStore,
} from '../../../application/ports/assessment.ports.js';
import type {
  EvaluationConditions,
  EvaluationKind,
  EvaluationLevel,
  EvaluationStatus,
  MeasurementSide,
  SiteDefinition,
  SiteFamily,
  SiteUnit,
} from '../../../domain/assessment-rules.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);
/** diff_pct es numeric(6,3): un valor que no cabe es derivado y se recalcula al leer. */
const storableDiff = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && Math.abs(value) < 1000 ? value : null;

const EVALUATION_FIELDS = {
  id: true,
  organizationId: true,
  patientId: true,
  evaluatorMemberId: true,
  kind: true,
  level: true,
  measuredAt: true,
  localDate: true,
  conditions: true,
  patientSnapshot: true,
  status: true,
  revision: true,
  amendsEvaluationId: true,
  amendReason: true,
  closedAt: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  version: true,
} as const;

interface EvaluationRow {
  id: string;
  organizationId: string;
  patientId: string;
  evaluatorMemberId: string;
  kind: string;
  level: string | null;
  measuredAt: Date;
  localDate: Date;
  conditions: unknown;
  patientSnapshot: unknown;
  status: string;
  revision: number;
  amendsEvaluationId: string | null;
  amendReason: string | null;
  closedAt: Date | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  version: number;
}

const toEvaluation = (row: EvaluationRow): EvaluationRecord => ({
  id: row.id,
  organizationId: row.organizationId as OrganizationId,
  patientId: row.patientId,
  evaluatorMemberId: row.evaluatorMemberId,
  kind: row.kind as EvaluationKind,
  level: row.level as EvaluationLevel | null,
  measuredAt: row.measuredAt,
  localDate: isoDate(row.localDate),
  // Se guardaron validados con su contrato (condiciones v1 y snapshot del paciente).
  conditions: row.conditions as EvaluationConditions,
  patientSnapshot: row.patientSnapshot as PatientSnapshot,
  status: row.status as EvaluationStatus,
  revision: row.revision,
  amendsEvaluationId: row.amendsEvaluationId,
  amendReason: row.amendReason,
  closedAt: row.closedAt,
  notes: row.notes,
  createdBy: row.createdBy as UserId,
  createdAt: row.createdAt,
  version: row.version,
});

/** Evaluaciones, tomas y bioimpedancia en assessment, con la transacción de la UnitOfWork y su RLS. */
@Injectable()
export class PrismaEvaluationStore implements EvaluationStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insert(evaluation: EvaluationRecord): Promise<void> {
    await this.db.tx.evaluation.create({
      data: {
        id: evaluation.id,
        organizationId: evaluation.organizationId,
        patientId: evaluation.patientId,
        evaluatorMemberId: evaluation.evaluatorMemberId,
        kind: evaluation.kind,
        level: evaluation.level,
        measuredAt: evaluation.measuredAt,
        localDate: asDate(evaluation.localDate),
        conditions: { ...evaluation.conditions },
        patientSnapshot: { ...evaluation.patientSnapshot },
        status: evaluation.status,
        revision: evaluation.revision,
        amendsEvaluationId: evaluation.amendsEvaluationId,
        amendReason: evaluation.amendReason,
        closedAt: evaluation.closedAt,
        notes: evaluation.notes,
        createdBy: evaluation.createdBy,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.createdAt,
        version: evaluation.version,
      },
    });
  }

  async find(id: string): Promise<EvaluationRecord | null> {
    const row = await this.db.tx.evaluation.findUnique({
      where: { id },
      select: EVALUATION_FIELDS,
    });
    return row ? toEvaluation(row) : null;
  }

  async listByPatient(patientId: string): Promise<readonly EvaluationRecord[]> {
    const rows = await this.db.tx.evaluation.findMany({
      where: { patientId },
      select: EVALUATION_FIELDS,
      orderBy: [{ measuredAt: 'desc' }, { revision: 'desc' }],
    });
    return rows.map(toEvaluation);
  }

  async amendedBy(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.tx.evaluation.findMany({
      where: { amendsEvaluationId: { in: [...ids] } },
      select: { id: true, amendsEvaluationId: true },
    });
    return new Map(
      rows.flatMap((r) => (r.amendsEvaluationId ? [[r.amendsEvaluationId, r.id]] : [])),
    );
  }

  async updateDraft(
    id: string,
    expectedVersion: number,
    changes: EvaluationChanges,
  ): Promise<boolean> {
    const { localDate, conditions, patientSnapshot, ...rest } = changes;
    const { count } = await this.db.tx.evaluation.updateMany({
      where: { id, version: expectedVersion, status: 'DRAFT' },
      data: {
        ...rest,
        ...(localDate === undefined ? {} : { localDate: asDate(localDate) }),
        ...(conditions === undefined ? {} : { conditions: { ...conditions } }),
        ...(patientSnapshot === undefined ? {} : { patientSnapshot: { ...patientSnapshot } }),
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return count === 1;
  }

  async touch(id: string): Promise<void> {
    await this.db.tx.evaluation.updateMany({
      where: { id, status: 'DRAFT' },
      data: { version: { increment: 1 }, updatedAt: new Date() },
    });
  }

  async close(id: string, expectedVersion: number, closedAt: Date): Promise<boolean> {
    const { count } = await this.db.tx.evaluation.updateMany({
      where: { id, version: expectedVersion, status: 'DRAFT' },
      data: { status: 'CLOSED', closedAt, version: { increment: 1 }, updatedAt: closedAt },
    });
    return count === 1;
  }

  async markAmended(id: string): Promise<boolean> {
    // El disparador de RN-C07 solo deja pasar el cambio de estado: version y updated_at quedan como estaban.
    const { count } = await this.db.tx.evaluation.updateMany({
      where: { id, status: 'CLOSED' },
      data: { status: 'AMENDED' },
    });
    return count === 1;
  }

  async measurements(evaluationId: string): Promise<readonly MeasurementRecord[]> {
    const rows = await this.db.tx.measurement.findMany({
      where: { evaluationId },
      select: { siteCode: true, attempt1: true, attempt2: true, attempt3: true, side: true },
    });
    return rows.map((row) => ({
      siteCode: row.siteCode,
      attempts: [row.attempt1, row.attempt2, row.attempt3].flatMap((value) =>
        value === null ? [] : [Number(value)],
      ),
      side: row.side as MeasurementSide,
    }));
  }

  async saveMeasurement(
    evaluationId: string,
    organizationId: OrganizationId,
    row: MeasurementRow,
  ): Promise<void> {
    const [attempt1 = 0, attempt2 = null, attempt3 = null] = row.attempts;
    const values = {
      attempt1,
      attempt2,
      attempt3,
      consolidatedValue: row.consolidatedValue,
      consolidation: row.consolidation,
      diffPct: storableDiff(row.diffPct),
      needsThird: row.needsThird,
      side: row.side,
    };
    await this.db.tx.measurement.upsert({
      where: { evaluationId_siteCode: { evaluationId, siteCode: row.siteCode } },
      create: { evaluationId, siteCode: row.siteCode, organizationId, ...values },
      update: values,
    });
  }

  async deleteMeasurement(evaluationId: string, siteCode: string): Promise<boolean> {
    const { count } = await this.db.tx.measurement.deleteMany({
      where: { evaluationId, siteCode },
    });
    return count === 1;
  }

  async biaReadings(evaluationId: string): Promise<readonly BiaReadingRecord[]> {
    const rows = await this.db.tx.biaReading.findMany({
      where: { evaluationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      evaluationId: row.evaluationId,
      deviceBrand: row.deviceBrand,
      deviceModel: row.deviceModel,
      // Se guardó validado con createBiaReadingSchema.
      readings: row.readings as unknown as BiaValueRecord[],
      enteredBy: row.enteredBy as UserId,
      createdAt: row.createdAt,
    }));
  }

  async insertBiaReading(organizationId: OrganizationId, reading: BiaReadingRecord): Promise<void> {
    await this.db.tx.biaReading.create({
      data: {
        id: reading.id,
        organizationId,
        evaluationId: reading.evaluationId,
        deviceBrand: reading.deviceBrand,
        deviceModel: reading.deviceModel,
        readings: reading.readings.map((value) => ({ ...value })),
        enteredBy: reading.enteredBy,
        createdAt: reading.createdAt,
      },
    });
  }

  async deleteBiaReading(evaluationId: string, readingId: string): Promise<boolean> {
    const { count } = await this.db.tx.biaReading.deleteMany({
      where: { id: readingId, evaluationId },
    });
    return count === 1;
  }

  async closedTimeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const rows = await this.db.tx.$queryRaw<
      { id: string; closed_at: Date; level: string | null; amend_reason: string | null }[]
    >`
      SELECT id, closed_at, level, amend_reason FROM assessment.evaluation
      WHERE patient_id = ${patientId}::uuid AND status IN ('CLOSED', 'AMENDED')
        AND (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (closed_at, id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY closed_at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: 'EVALUATION_CLOSED',
      occurredAt: row.closed_at,
      refId: row.id,
      label: row.level ?? 'BIA',
      detail: row.amend_reason,
    }));
  }
}

/** El catálogo global de sitios; cambia solo por migración, así que se lee una vez por proceso. */
@Injectable()
export class PrismaSiteCatalog implements SiteCatalog {
  #sites: Promise<readonly SiteDefinition[]> | null = null;

  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  all(): Promise<readonly SiteDefinition[]> {
    this.#sites ??= this.#load().catch((error: unknown) => {
      this.#sites = null;
      throw error;
    });
    return this.#sites;
  }

  async #load(): Promise<readonly SiteDefinition[]> {
    const rows = await this.db.tx.measurementSite.findMany({ orderBy: { displayOrder: 'asc' } });
    return rows.map((row) => ({
      code: row.code,
      family: row.family as SiteFamily,
      nameEs: row.nameEs,
      unit: row.unit as SiteUnit,
      minValue: Number(row.minValue),
      maxValue: Number(row.maxValue),
      tolerancePct: Number(row.tolerancePct),
      minAttempts: row.minAttempts,
      levels: [
        ...(row.inBasic ? (['BASIC'] as const) : []),
        ...(row.inIsak1 ? (['ISAK1'] as const) : []),
        ...(row.inIsak2 ? (['ISAK2'] as const) : []),
      ],
      displayOrder: row.displayOrder,
    }));
  }
}

/** ETM por evaluador y sitio (RN-C05): solo se agregan filas. */
@Injectable()
export class PrismaTechnicalErrorStore implements TechnicalErrorStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insert(rows: readonly TechnicalErrorRecord[]): Promise<void> {
    await this.db.tx.evaluatorError.createMany({
      data: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        memberId: row.memberId,
        siteCode: row.siteCode,
        temAbs: row.temAbs,
        temRelPct: row.temRelPct,
        source: row.source,
        sampleSize: row.sampleSize,
        ...(row.pairs ? { pairs: row.pairs.map(([a, b]) => [a, b]) } : {}),
        validFrom: asDate(row.validFrom),
        createdAt: row.createdAt,
      })),
    });
  }

  async current(memberId: string, onDate: string): Promise<readonly TechnicalErrorRecord[]> {
    const rows = await this.db.tx.evaluatorError.findMany({
      where: { memberId, validFrom: { lte: asDate(onDate) } },
      orderBy: [{ siteCode: 'asc' }, { validFrom: 'desc' }, { createdAt: 'desc' }],
      distinct: ['siteCode'],
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId as OrganizationId,
      memberId: row.memberId,
      siteCode: row.siteCode,
      source: row.source as TechnicalErrorRecord['source'],
      temAbs: num(row.temAbs) ?? 0,
      temRelPct: num(row.temRelPct) ?? 0,
      sampleSize: row.sampleSize,
      // Se guardaron validados con su contrato: pares de dos números.
      pairs: (row.pairs as [number, number][] | null) ?? null,
      validFrom: isoDate(row.validFrom),
      createdAt: row.createdAt,
    }));
  }
}
