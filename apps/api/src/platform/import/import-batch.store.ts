import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../database/prisma.provider.js';
import type { ImportRowError, ImportStatus } from './catalog-import.js';

/** Un lote terminado de platform.import_batch (RN-I04). */
export interface ImportBatch {
  readonly id: string;
  readonly organizationId: string | null;
  readonly kind: string;
  readonly fileName: string;
  readonly fileSha256: Uint8Array;
  readonly status: ImportStatus;
  readonly rowsTotal: number | null;
  readonly rowsOk: number | null;
  readonly rowsFailed: number | null;
  readonly errors: readonly ImportRowError[];
  readonly startedBy: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

/** Los estados de un archivo ya aplicado: los que cubre el índice único import_batch_once. */
const APPLIED = ['PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS'];

/** platform.import_batch con la transacción de la UnitOfWork; la RLS de catálogo deja escribir lo global a SYSTEM. */
@Injectable()
export class ImportBatchStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  /** Una importación a la vez por organización y tipo, hasta el fin de la transacción. */
  async lock(organizationId: string | null, kind: string): Promise<void> {
    const key = `platform.import_batch:${organizationId ?? 'global'}:${kind}`;
    await this.db.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
  }

  /** El lote que ya aplicó este mismo archivo, si lo hay. */
  async applied(
    organizationId: string | null,
    kind: string,
    fileSha256: Uint8Array,
  ): Promise<string | null> {
    const batch = await this.db.tx.importBatch.findFirst({
      where: {
        organizationId,
        kind,
        fileSha256: new Uint8Array(fileSha256),
        status: { in: APPLIED },
      },
      orderBy: { startedAt: 'asc' },
      select: { id: true },
    });
    return batch?.id ?? null;
  }

  async insert(batch: ImportBatch): Promise<void> {
    await this.db.tx.importBatch.createMany({
      data: [
        {
          ...batch,
          fileSha256: new Uint8Array(batch.fileSha256),
          errors: batch.errors.map(({ row, messages }) => ({ row, messages })),
        },
      ],
    });
  }
}
