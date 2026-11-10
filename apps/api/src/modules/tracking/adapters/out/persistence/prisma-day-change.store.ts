import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { DayChangeStore } from '../../../application/ports/day-changes.ports.js';
import type { DayChange, DayChangeKind } from '../../../domain/day-changes.js';

const asDate = (localDate: string): Date => new Date(`${localDate}T00:00:00Z`);

interface DayChangeRow {
  readonly id: string;
  readonly patientId: string;
  readonly localDate: Date;
  readonly kind: string;
  readonly dayProfileCode: string | null;
  readonly createdAt: Date;
}

const changeOf = (row: DayChangeRow): DayChange => ({
  id: row.id,
  localDate: row.localDate.toISOString().slice(0, 10),
  // La columna solo admite estos tres (CHECK de la migración).
  kind: row.kind as DayChangeKind,
  dayProfileCode: row.dayProfileCode,
  createdAt: row.createdAt,
});

const ACTIVE_COLUMNS = {
  id: true,
  patientId: true,
  localDate: true,
  kind: true,
  dayProfileCode: true,
  createdAt: true,
} as const;

/** tracking.day_change (ADR-104) con la transacción de la UnitOfWork y su RLS. */
@Injectable()
export class PrismaDayChangeStore implements DayChangeStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async active(patientId: string, from: string, to: string): Promise<readonly DayChange[]> {
    const rows = await this.db.tx.dayChange.findMany({
      where: {
        patientId,
        voidedAt: null,
        localDate: { gte: asDate(from), lte: asDate(to) },
      },
      select: ACTIVE_COLUMNS,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(changeOf);
  }

  async activeSince(from: string): Promise<ReadonlyMap<string, readonly DayChange[]>> {
    const rows = await this.db.tx.dayChange.findMany({
      where: { voidedAt: null, localDate: { gte: asDate(from) } },
      select: ACTIVE_COLUMNS,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byPatient = new Map<string, DayChange[]>();
    for (const row of rows) {
      const list = byPatient.get(row.patientId) ?? [];
      list.push(changeOf(row));
      byPatient.set(row.patientId, list);
    }
    return byPatient;
  }

  async insert(row: Parameters<DayChangeStore['insert']>[0]): Promise<void> {
    await this.db.tx.dayChange.createMany({
      data: [{ ...row, localDate: asDate(row.localDate) }],
    });
  }

  async void(id: string, voidedBy: string, voidedAt: Date): Promise<void> {
    await this.db.tx.dayChange.updateMany({
      where: { id, voidedAt: null },
      data: { voidedBy, voidedAt },
    });
  }
}
