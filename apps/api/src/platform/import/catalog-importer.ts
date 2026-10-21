import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type IdGenerator,
  type OrganizationId,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  readCatalogFile,
  statusOf,
  type ImportRowError,
  type ImportStatus,
} from './catalog-import.js';
import { ImportBatchStore, type ImportBatch } from './import-batch.store.js';
import { ImportRegistry } from './import-registry.js';

export interface ImportRequest {
  readonly kind: string;
  readonly fileName: string;
  readonly content: Uint8Array;
  /** null: catálogo global, que solo escribe SYSTEM (RN-I01). */
  readonly organizationId: OrganizationId | null;
  /** Quien la pidió; la CLI exige un PLATFORM_ADMIN activo. */
  readonly startedBy: UserId;
}

export interface ImportReport {
  readonly batchId: string;
  readonly status: ImportStatus;
  readonly rowsTotal: number | null;
  readonly rowsOk: number | null;
  readonly rowsFailed: number | null;
  /** Todos los errores; el lote guarda los primeros MAX_STORED_ERRORS. */
  readonly errors: readonly ImportRowError[];
  /** Con DUPLICATE: el lote que ya aplicó el archivo. */
  readonly appliedBy?: string;
  /** Si guardar falló: el error técnico, para quien corre la importación. El lote no lo guarda. */
  readonly failure?: string;
}

type Outcome = Pick<ImportReport, 'status' | 'rowsTotal' | 'rowsOk' | 'rowsFailed' | 'errors'>;

/** Los primeros errores van al lote; el resto solo cuenta en rows_failed. */
export const MAX_STORED_ERRORS = 100;

/** Un lote que no llegó a validar filas: DUPLICATE o un archivo ilegible. */
const EMPTY = { rowsTotal: null, rowsOk: null, rowsFailed: null, errors: [] } as const;

/**
 * Importador genérico de catálogos (RN-I04): cada archivo es un lote con su hash SHA-256, sus conteos de filas
 * correctas y con error y el informe de errores por fila. Todo ocurre en una transacción de SYSTEM: si el mismo
 * archivo ya se aplicó, deja un lote DUPLICATE y no toca los datos; si no, el módulo dueño guarda las filas válidas.
 * Si guardar falla, la transacción se revierte entera y otra deja el lote FAILED.
 */
@Injectable()
export class CatalogImporter {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly batches: ImportBatchStore,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  kinds(): readonly string[] {
    return this.registry.kinds();
  }

  async run(request: ImportRequest): Promise<ImportReport> {
    const catalog = this.registry.get(request.kind);
    if (!catalog) {
      throw new Error(
        `No hay importación de tipo «${request.kind}». Tipos: ${this.registry.kinds().join(', ')}.`,
      );
    }
    const started = {
      id: this.ids.newId<'ImportBatchId'>(),
      organizationId: request.organizationId,
      kind: request.kind,
      fileName: request.fileName,
      fileSha256: createHash('sha256').update(request.content).digest(),
      startedBy: request.startedBy,
      startedAt: this.clock.now(),
    };
    const file = readCatalogFile(catalog, request.content);
    const context = systemContext(request.organizationId);
    try {
      return await this.uow.run(context, async () => {
        await this.batches.lock(started.organizationId, started.kind);
        const appliedBy = await this.batches.applied(
          started.organizationId,
          started.kind,
          started.fileSha256,
        );
        if (appliedBy) {
          const outcome = { ...EMPTY, status: 'DUPLICATE' as const };
          return { ...(await this.#close(started, outcome)), appliedBy };
        }
        if (!file.ok) {
          const errors = [{ row: null, messages: [file.error] }];
          return this.#close(started, { ...EMPTY, status: 'FAILED', errors });
        }
        const status = statusOf(file.value);
        if (status !== 'FAILED') await catalog.save(file.value.rows);
        return this.#close(started, {
          status,
          rowsTotal: file.value.total,
          rowsOk: file.value.rows.length,
          rowsFailed: file.value.total - file.value.rows.length,
          errors: file.value.errors,
        });
      });
    } catch (error) {
      const errors = [
        { row: null, messages: ['No se pudo guardar: la transacción se revirtió entera.'] },
      ];
      const total = file.ok ? file.value.total : null;
      const report = await this.uow.run(context, () =>
        this.#close(started, {
          status: 'FAILED',
          rowsTotal: total,
          rowsOk: 0,
          rowsFailed: total,
          errors,
        }),
      );
      return { ...report, failure: error instanceof Error ? error.message : String(error) };
    }
  }

  async #close(
    started: Omit<ImportBatch, keyof Outcome | 'finishedAt'>,
    outcome: Outcome,
  ): Promise<ImportReport> {
    await this.batches.insert({
      ...started,
      ...outcome,
      errors: outcome.errors.slice(0, MAX_STORED_ERRORS),
      finishedAt: this.clock.now(),
    });
    return { batchId: started.id, ...outcome };
  }
}
