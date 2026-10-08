import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { systemContext, UNIT_OF_WORK, type UnitOfWork } from '@nutricoach/shared-kernel';
import type { Db } from '../database/prisma.provider.js';

/** Tablas particionadas por mes (05 §5). La misma lista cerrada vive en app.ensure_monthly_partitions. */
export const PARTITIONED_TABLES = [
  'tracking.food_log',
  'tracking.hydration_log',
  'tracking.workout_log',
  'tracking.set_log',
  'tracking.daily_checkin',
  'tracking.metric_log',
  'tracking.note_log',
  'tracking.device_reading',
  'audit.audit_log',
] as const;

/** Meses por adelantado que se mantienen creados. */
const MONTHS_AHEAD = 3;

export interface CleanupResult {
  readonly outboxEvents: number;
  readonly processedEvents: number;
  readonly idempotencyKeys: number;
  readonly rateLimits: number;
}

/** Trabajos diarios del worker como SYSTEM (01 §4): particiones y limpieza. */
@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TransactionHost) private readonly db: Db,
  ) {}

  /** Crea las particiones que falten hasta tres meses después del actual. Devuelve cuántas creó. */
  ensurePartitions(): Promise<number> {
    return this.uow.run(systemContext(), async () => {
      let created = 0;
      for (const table of PARTITIONED_TABLES) {
        const [row] = await this.db.tx.$queryRaw<{ created: number }[]>`
          SELECT app.ensure_monthly_partitions(${table}::regclass, ${MONTHS_AHEAD}) AS created`;
        created += row?.created ?? 0;
      }
      return created;
    });
  }

  /**
   * Outbox publicado de más de 7 días, eventos procesados de más de 30, claves de idempotencia vencidas y ventanas
   * del límite de intentos de más de un día (ADR-030).
   */
  cleanup(): Promise<CleanupResult> {
    return this.uow.run(systemContext(), async () => ({
      outboxEvents: await this.db.tx.$executeRaw`
        DELETE FROM platform.outbox_event WHERE published_at < now() - interval '7 days'`,
      processedEvents: await this.db.tx.$executeRaw`
        DELETE FROM platform.processed_event WHERE processed_at < now() - interval '30 days'`,
      idempotencyKeys: await this.db.tx.$executeRaw`
        DELETE FROM platform.idempotency_key WHERE expires_at < now()`,
      rateLimits:
        (
          await this.db.tx.$queryRaw<
            { removed: number }[]
          >`SELECT app.purge_rate_limits() AS removed`
        )[0]?.removed ?? 0,
    }));
  }
}
