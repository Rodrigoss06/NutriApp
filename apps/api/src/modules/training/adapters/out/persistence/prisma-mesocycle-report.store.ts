import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  MesocycleReportStore,
  ReportSending,
} from '../../../application/ports/mesocycle-report.ports.js';
import type {
  MesocycleReportRecord,
  MesocycleReportStatus,
  MesocycleReportTexts,
} from '../../../domain/mesocycle-report.js';

type ReportRow = Awaited<
  ReturnType<PrismaMesocycleReportStore['db']['tx']['mesocycleReport']['findFirstOrThrow']>
>;

const toReport = (row: ReportRow): MesocycleReportRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  programLineageId: row.programLineageId,
  mesocyclePosition: row.mesocyclePosition,
  status: row.status as MesocycleReportStatus,
  achievement: row.achievement,
  limitation: row.limitation,
  adjustment: row.adjustment,
  priority: row.priority,
  studentComment: row.studentComment,
  studentCommentedAt: row.studentCommentedAt,
  snapshot: row.snapshot,
  sentAt: row.sentAt,
  sentBy: row.sentBy,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  version: row.version,
});

/** training.mesocycle_report (ADR-117): la base impide cambiar lo enviado y que el alumno toque lo del coach. */
@Injectable()
export class PrismaMesocycleReportStore implements MesocycleReportStore {
  constructor(@Inject(TransactionHost) readonly db: Db) {}

  async insert(report: MesocycleReportRecord): Promise<void> {
    await this.db.tx.mesocycleReport.create({
      data: {
        id: report.id,
        organizationId: report.organizationId,
        patientId: report.patientId,
        programLineageId: report.programLineageId,
        mesocyclePosition: report.mesocyclePosition,
        status: report.status,
        achievement: report.achievement,
        limitation: report.limitation,
        adjustment: report.adjustment,
        priority: report.priority,
        createdBy: report.createdBy,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        version: report.version,
      },
      select: { id: true },
    });
  }

  async find(id: string): Promise<MesocycleReportRecord | null> {
    const row = await this.db.tx.mesocycleReport.findUnique({ where: { id } });
    return row ? toReport(row) : null;
  }

  async byPosition(lineageId: string, position: number): Promise<MesocycleReportRecord | null> {
    const row = await this.db.tx.mesocycleReport.findUnique({
      where: {
        programLineageId_mesocyclePosition: {
          programLineageId: lineageId,
          mesocyclePosition: position,
        },
      },
    });
    return row ? toReport(row) : null;
  }

  async ofLineage(lineageId: string): Promise<readonly MesocycleReportRecord[]> {
    const rows = await this.db.tx.mesocycleReport.findMany({
      where: { programLineageId: lineageId },
      orderBy: { mesocyclePosition: 'asc' },
    });
    return rows.map(toReport);
  }

  async saveTexts(
    id: string,
    expectedVersion: number,
    texts: MesocycleReportTexts,
    at: Date,
  ): Promise<boolean> {
    const { count } = await this.db.tx.mesocycleReport.updateMany({
      where: { id, version: expectedVersion, status: 'DRAFT' },
      data: { ...texts, updatedAt: at, version: { increment: 1 } },
    });
    return count === 1;
  }

  async send(
    id: string,
    expectedVersion: number,
    texts: MesocycleReportTexts,
    sending: ReportSending,
  ): Promise<boolean> {
    const { count } = await this.db.tx.mesocycleReport.updateMany({
      where: { id, version: expectedVersion, status: 'DRAFT' },
      data: {
        ...texts,
        status: 'SENT',
        snapshot: sending.snapshot as object,
        snapshotSchemaVersion: sending.snapshotSchemaVersion,
        snapshotHash: Buffer.from(sending.snapshotHash, 'hex'),
        sentAt: sending.sentAt,
        sentBy: sending.sentBy,
        updatedAt: sending.sentAt,
        version: { increment: 1 },
      },
    });
    return count === 1;
  }

  async saveComment(id: string, comment: string | null, at: Date): Promise<boolean> {
    const { count } = await this.db.tx.mesocycleReport.updateMany({
      where: { id, status: 'SENT' },
      data: {
        studentComment: comment,
        studentCommentedAt: comment === null ? null : at,
        updatedAt: at,
        version: { increment: 1 },
      },
    });
    return count === 1;
  }

  async sentOfPatient(patientId: string): Promise<readonly MesocycleReportRecord[]> {
    const rows = await this.db.tx.mesocycleReport.findMany({
      where: { patientId, status: 'SENT' },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toReport);
  }
}
