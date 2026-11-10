import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  FatiguePanelThresholdRow,
  PublishedProgramRef,
  ReviewDecision,
  ThresholdRow,
  ThresholdValues,
  VolumeFactorsRow,
  WeeklyReviewStore,
} from '../../../application/ports/weekly-review.ports.js';
import type {
  CoachDecision,
  WeeklyAction,
  WeeklyLight,
  WeeklyReviewRecord,
  WeeklyReviewStatus,
} from '../../../domain/weekly-review.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

/** Una tabla de factores guardada: la migración y la columna aseguran que es una lista; cada fila se lee con sus tipos. */
function factorRows(value: unknown): VolumeFactorsRow['rir'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (item === null || typeof item !== 'object') return [];
    const { from, factor, orMore } = item as Record<string, unknown>;
    return typeof from === 'number' && typeof factor === 'number'
      ? [{ from, factor, orMore: orMore === true }]
      : [];
  });
}
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

type ReviewRow = Awaited<
  ReturnType<PrismaWeeklyReviewStore['db']['tx']['weeklyReview']['findFirstOrThrow']>
>;
type ThresholdModel = Awaited<
  ReturnType<PrismaWeeklyReviewStore['db']['tx']['readinessThreshold']['findFirstOrThrow']>
>;

const toReview = (row: ReviewRow): WeeklyReviewRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  programId: row.programId,
  weekNo: row.weekNo,
  weekStart: isoDate(row.weekStart),
  weekEnd: isoDate(row.weekEnd),
  methodCode: row.methodCode,
  methodVersion: row.methodVersion,
  engineVersion: row.engineVersion,
  thresholdId: row.thresholdId,
  inputs: row.inputs,
  inputsHash: Buffer.from(row.inputsHash).toString('hex'),
  light: row.light as WeeklyLight,
  plannedVolumeFactor: Number(row.plannedVolumeFactor),
  suggestedVolumeFactor: num(row.suggestedVolumeFactor),
  suggestedAction: row.suggestedAction as WeeklyAction,
  computedAt: row.computedAt,
  coachDecision: row.coachDecision as CoachDecision | null,
  decidedVolumeFactor: num(row.decidedVolumeFactor),
  decisionNote: row.decisionNote,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
  resultingProgramId: row.resultingProgramId,
  status: row.status as WeeklyReviewStatus,
});

const toThreshold = (row: ThresholdModel): ThresholdRow => ({
  id: row.id,
  organizationId: row.organizationId,
  validFrom: isoDate(row.validFrom),
  neutralScore: Number(row.neutralScore),
  readinessGreenMin: Number(row.readinessGreenMin),
  readinessRedBelow: Number(row.readinessRedBelow),
  performanceMinPct: Number(row.performanceMinPct),
  weeklySleepMinHours: Number(row.weeklySleepMinHours),
  fatigueSorenessAmberAbove: Number(row.fatigueSorenessAmberAbove),
  nutritionMinPct: Number(row.nutritionMinPct),
});

/** training.weekly_review y training.readiness_threshold con la RLS del contexto (05.2). */
@Injectable()
export class PrismaWeeklyReviewStore implements WeeklyReviewStore {
  constructor(@Inject(TransactionHost) readonly db: Db) {}

  async publishedPrograms(): Promise<readonly PublishedProgramRef[]> {
    const rows = await this.db.tx.trainingProgram.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, patientId: true, lineageId: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      programId: row.id,
      patientId: row.patientId,
      lineageId: row.lineageId,
    }));
  }

  async publishedProgramOf(patientId: string): Promise<PublishedProgramRef | null> {
    const row = await this.db.tx.trainingProgram.findFirst({
      where: { patientId, status: 'PUBLISHED' },
      select: { id: true, patientId: true, lineageId: true },
    });
    return row ? { programId: row.id, patientId: row.patientId, lineageId: row.lineageId } : null;
  }

  async currentOf(lineageId: string, weekNo: number): Promise<WeeklyReviewRecord | null> {
    const row = await this.db.tx.weeklyReview.findFirst({
      where: { weekNo, status: 'CURRENT', trainingProgram: { lineageId } },
    });
    return row ? toReview(row) : null;
  }

  async insert(review: WeeklyReviewRecord): Promise<void> {
    await this.db.tx.weeklyReview.create({
      data: {
        id: review.id,
        organizationId: review.organizationId,
        patientId: review.patientId,
        programId: review.programId,
        weekNo: review.weekNo,
        weekStart: asDate(review.weekStart),
        weekEnd: asDate(review.weekEnd),
        methodCode: review.methodCode,
        methodVersion: review.methodVersion,
        engineVersion: review.engineVersion,
        thresholdId: review.thresholdId,
        inputs: review.inputs as object,
        inputsHash: Buffer.from(review.inputsHash, 'hex'),
        light: review.light,
        plannedVolumeFactor: review.plannedVolumeFactor,
        suggestedVolumeFactor: review.suggestedVolumeFactor,
        suggestedAction: review.suggestedAction,
        computedAt: review.computedAt,
        status: review.status,
      },
      select: { id: true },
    });
  }

  async supersede(id: string): Promise<void> {
    await this.db.tx.weeklyReview.update({ where: { id }, data: { status: 'SUPERSEDED' } });
  }

  async find(id: string): Promise<WeeklyReviewRecord | null> {
    const row = await this.db.tx.weeklyReview.findUnique({ where: { id } });
    return row ? toReview(row) : null;
  }

  async listOfLineage(lineageId: string): Promise<readonly WeeklyReviewRecord[]> {
    const rows = await this.db.tx.weeklyReview.findMany({
      where: { trainingProgram: { lineageId } },
      orderBy: [{ weekNo: 'asc' }, { computedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toReview);
  }

  async decide(id: string, decision: ReviewDecision): Promise<boolean> {
    const { count } = await this.db.tx.weeklyReview.updateMany({
      where: { id, status: 'CURRENT', coachDecision: null },
      data: {
        coachDecision: decision.coachDecision,
        decidedVolumeFactor: decision.decidedVolumeFactor,
        decisionNote: decision.decisionNote,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        resultingProgramId: decision.resultingProgramId,
      },
    });
    return count === 1;
  }

  async thresholdFor(organizationId: string, onDate: string): Promise<ThresholdRow | null> {
    const row = await this.db.tx.readinessThreshold.findFirst({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
        validFrom: { lte: asDate(onDate) },
      },
      // La de la organización manda sobre la global; entre las suyas, la más reciente (05.2).
      orderBy: [{ organizationId: { sort: 'asc', nulls: 'last' } }, { validFrom: 'desc' }],
    });
    return row ? toThreshold(row) : null;
  }

  async volumeFactorVersions(organizationId: string): Promise<readonly VolumeFactorsRow[]> {
    const rows = await this.db.tx.volumeFactorTable.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      validFrom: row.validFrom.toISOString().slice(0, 10),
      rir: factorRows(row.rirFactors),
      rest: factorRows(row.restFactors),
    }));
  }

  async fatiguePanelThresholdVersions(
    organizationId: string,
  ): Promise<readonly FatiguePanelThresholdRow[]> {
    const rows = await this.db.tx.fatiguePanelThreshold.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      validFrom: isoDate(row.validFrom),
      recoveryRedStressMin: Number(row.recoveryRedStressMin),
      recoveryRedSleepBelowHours: Number(row.recoveryRedSleepBelowHours),
      recoveryAmberStressMin: Number(row.recoveryAmberStressMin),
      recoveryAmberSleepBelowHours: Number(row.recoveryAmberSleepBelowHours),
      fatigueRedMin: Number(row.fatigueRedMin),
      fatigueAmberMin: Number(row.fatigueAmberMin),
      loadAmberAbovePct: Number(row.loadAmberAbovePct),
      loadRedAbovePct: Number(row.loadRedAbovePct),
    }));
  }

  async baseThreshold(onDate: string): Promise<ThresholdRow | null> {
    const row = await this.db.tx.readinessThreshold.findFirst({
      where: { organizationId: null, validFrom: { lte: asDate(onDate) } },
      orderBy: { validFrom: 'desc' },
    });
    return row ? toThreshold(row) : null;
  }

  async ownThresholdOn(organizationId: string, validFrom: string): Promise<ThresholdRow | null> {
    const row = await this.db.tx.readinessThreshold.findFirst({
      where: { organizationId, validFrom: asDate(validFrom) },
    });
    return row ? toThreshold(row) : null;
  }

  async insertThreshold(row: ThresholdRow): Promise<void> {
    await this.db.tx.readinessThreshold.create({
      data: { ...row, validFrom: asDate(row.validFrom) },
      select: { id: true },
    });
  }

  async updateThreshold(id: string, values: ThresholdValues): Promise<void> {
    await this.db.tx.readinessThreshold.update({
      where: { id },
      data: values,
      select: { id: true },
    });
  }
}
