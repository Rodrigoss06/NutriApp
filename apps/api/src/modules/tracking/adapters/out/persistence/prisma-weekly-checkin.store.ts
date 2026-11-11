import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  StoredWeeklyCheckin,
  WeeklyCheckinStore,
} from '../../../application/ports/weekly-checkin.ports.js';

const asDate = (localDate: string): Date => new Date(`${localDate}T00:00:00Z`);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

interface WeeklyCheckinRow {
  readonly id: string;
  readonly patientId: string;
  readonly weekDate: Date;
  readonly clientId: string;
  readonly loggedOn: Date;
  readonly nutritionCompliancePct: number;
  readonly metricLogId: string | null;
  readonly noteId: string | null;
  readonly status: string;
  readonly createdAt: Date;
}

const checkinOf = (row: WeeklyCheckinRow): StoredWeeklyCheckin => ({
  id: row.id,
  patientId: row.patientId,
  weekDate: isoDate(row.weekDate),
  clientId: row.clientId,
  loggedOn: isoDate(row.loggedOn),
  nutritionCompliancePct: row.nutritionCompliancePct,
  metricLogId: row.metricLogId,
  noteId: row.noteId,
  // La columna solo admite estos dos (CHECK de la migración).
  status: row.status === 'VOIDED' ? 'VOIDED' : 'ACTIVE',
  createdAt: row.createdAt,
});

/** tracking.weekly_checkin (ADR-109) con la transacción de la UnitOfWork y su RLS. */
@Injectable()
export class PrismaWeeklyCheckinStore implements WeeklyCheckinStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async byClientId(
    patientId: string,
    weekDate: string,
    clientId: string,
  ): Promise<StoredWeeklyCheckin | null> {
    const row = await this.db.tx.weeklyCheckin.findFirst({
      where: { patientId, weekDate: asDate(weekDate), clientId },
    });
    return row ? checkinOf(row) : null;
  }

  async active(patientId: string, weekDate: string): Promise<StoredWeeklyCheckin | null> {
    const row = await this.db.tx.weeklyCheckin.findFirst({
      where: { patientId, weekDate: asDate(weekDate), status: 'ACTIVE' },
    });
    return row ? checkinOf(row) : null;
  }

  async activeBetween(
    patientId: string,
    from: string,
    to: string,
  ): Promise<readonly StoredWeeklyCheckin[]> {
    const rows = await this.db.tx.weeklyCheckin.findMany({
      where: { patientId, status: 'ACTIVE', weekDate: { gte: asDate(from), lte: asDate(to) } },
      orderBy: { weekDate: 'asc' },
    });
    return rows.map(checkinOf);
  }

  async insert(
    row: Omit<StoredWeeklyCheckin, 'status'> & { readonly organizationId: string },
  ): Promise<void> {
    await this.db.tx.weeklyCheckin.createMany({
      data: [
        {
          id: row.id,
          organizationId: row.organizationId,
          patientId: row.patientId,
          weekDate: asDate(row.weekDate),
          clientId: row.clientId,
          loggedOn: asDate(row.loggedOn),
          nutritionCompliancePct: row.nutritionCompliancePct,
          metricLogId: row.metricLogId,
          noteId: row.noteId,
          createdAt: row.createdAt,
        },
      ],
    });
  }

  async void(id: string, voidedAt: Date): Promise<void> {
    await this.db.tx.weeklyCheckin.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedAt },
    });
  }
}
