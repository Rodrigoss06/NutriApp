import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  AuditLogFilter,
  AuditLogRecord,
  AuditLogStore,
} from '../../../application/ports/audit-log.port.js';

/** audit.audit_log por rango de fechas (poda de particiones) y orden inverso estable: (occurred_at, id). */
@Injectable()
export class PrismaAuditLogStore implements AuditLogStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async list(filter: AuditLogFilter): Promise<readonly AuditLogRecord[]> {
    const rows = await this.db.tx.auditLog.findMany({
      where: {
        occurredAt: { gte: filter.from, lte: filter.to },
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.userId ? { actorUserId: filter.userId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.after
          ? {
              OR: [
                { occurredAt: { lt: filter.after.occurredAt } },
                { occurredAt: filter.after.occurredAt, id: { lt: filter.after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      select: {
        id: true,
        occurredAt: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        resourceType: true,
        resourceId: true,
        patientId: true,
        changedFields: true,
        outcome: true,
        requestId: true,
      },
    });
    return rows.map((row) => ({ ...row, actorUserId: row.actorUserId as UserId | null }));
  }
}
