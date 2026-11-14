import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  NewPatientExport,
  PatientExportStore,
} from '../../../application/ports/patient-export.ports.js';
import type { PatientExportTable } from '../../../application/patient-export-sources.js';
import type {
  ExportRequesterRole,
  PatientExportRecord,
  PatientExportStatus,
} from '../../../domain/patient-export.js';

interface ExportRow {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly requestedBy: string;
  readonly requestedByRole: string;
  readonly requestedByMember: string | null;
  readonly status: string;
  readonly fileId: string | null;
  readonly sizeBytes: bigint | null;
  readonly createdAt: Date;
  readonly readyAt: Date | null;
  readonly expiresAt: Date | null;
}

const toRecord = (row: ExportRow): PatientExportRecord => ({
  ...row,
  requestedByRole: row.requestedByRole as ExportRequesterRole,
  status: row.status as PatientExportStatus,
  sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
});

/** Solo esquema.tabla en minúsculas: la tabla y su SQL vienen del código del contexto dueño, nunca de una petición. */
const TABLE = /^[a-z_]+\.[a-z_]+$/;

@Injectable()
export class PrismaPatientExportStore implements PatientExportStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insert(record: NewPatientExport): Promise<void> {
    await this.db.tx.patientExport.createMany({ data: [{ ...record, status: 'PENDING' }] });
  }

  async find(id: string): Promise<PatientExportRecord | null> {
    const row = await this.db.tx.patientExport.findFirst({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async listByRequester(
    patientId: string,
    requestedBy: string,
    since: Date,
  ): Promise<readonly PatientExportRecord[]> {
    const rows = await this.db.tx.patientExport.findMany({
      where: { patientId, requestedBy, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map(toRecord);
  }

  async markReady(
    id: string,
    file: { readonly fileId: string; readonly sizeBytes: number },
    readyAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const { count } = await this.db.tx.patientExport.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'READY',
        fileId: file.fileId,
        sizeBytes: BigInt(file.sizeBytes),
        readyAt,
        expiresAt,
      },
    });
    return count === 1;
  }

  async toClose(
    expiredAt: Date,
    staleBefore: Date,
  ): Promise<{ expired: readonly PatientExportRecord[]; stale: readonly PatientExportRecord[] }> {
    const [expired, stale] = await Promise.all([
      this.db.tx.patientExport.findMany({
        where: { status: 'READY', expiresAt: { lte: expiredAt } },
        take: 500,
      }),
      this.db.tx.patientExport.findMany({
        where: { status: 'PENDING', createdAt: { lte: staleBefore } },
        take: 500,
      }),
    ]);
    return { expired: expired.map(toRecord), stale: stale.map(toRecord) };
  }

  async close(id: string, status: 'EXPIRED' | 'FAILED'): Promise<void> {
    await this.db.tx.patientExport.updateMany({
      where: { id, status: status === 'EXPIRED' ? 'READY' : 'PENDING' },
      data: { status },
    });
  }

  async rows(
    table: PatientExportTable,
    params: { readonly patientId: string; readonly requesterMemberId: string | null },
  ): Promise<readonly Record<string, unknown>[]> {
    if (!TABLE.test(table.table))
      throw new Error(`Tabla de exportación inválida: «${table.table}».`);
    const where = table.where ?? 'patient_id = $1';
    const values = where.includes('$2')
      ? [params.patientId, params.requesterMemberId]
      : [params.patientId];
    const result = await this.db.tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(
      `SELECT to_jsonb(t) AS row FROM ${table.table} t WHERE ${where} ORDER BY ${table.orderBy ?? 'id'}`,
      ...values,
    );
    return result.map(({ row }) => row);
  }
}
